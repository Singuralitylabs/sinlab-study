import {
  ANNOUNCEMENT_EMAIL_RETRY_DAYS,
  EMAIL_DIGEST_LOCK_NAME,
  EMAIL_DIGEST_LOCK_TTL_MS,
  EMAIL_DIGEST_SEND_INTERVAL_MS,
  EMAIL_DIGEST_TIME_BUDGET_MS,
  EMAIL_KIND,
  PROMOTIONAL_EMAIL_KINDS,
  type PromotionalEmailKind,
  RETRYABLE_EMAIL_ERROR,
  WEEKLY_DIGEST_CATCH_UP_DAYS,
  WEEKLY_DIGEST_RESERVATION_KIND,
} from "@/app/constants/notifications";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { isAnnouncementTarget } from "@/app/lib/announcement-target";
import {
  addDays,
  coversPreviousWeek,
  cycleStartOf,
  type DigestContent,
  type DigestUser,
  daysBetween,
  isBefore,
  isSameOrAfter,
  isWeeklyDigestTarget,
  jstStartOfDayIso,
  lockedThemeNames,
  planMilestoneEmails,
  resolveNextContent,
  toJstDateString,
  visibleContentsFor,
} from "@/app/lib/email-digest";
import type { EmailSettingsSnapshot } from "@/app/lib/email-settings";
import type { EmailTexts } from "@/app/lib/email-template";
import { type EmailMarkdown, renderEmailMarkdown } from "@/app/lib/markdown-email";
import { resolveNotificationEmail } from "@/app/lib/notification-email";
import {
  applyPublishedNestedThemeFilters,
  type NestedThemeTree,
  orderContentsAcrossThemes,
} from "@/app/lib/published-theme-tree";
import {
  countUnovercomeReviewItems,
  deriveReviewListItems,
  filterReviewItemsToVisibleContents,
  type ReviewListSourceReview,
} from "@/app/lib/review-list";
import { isWebPushConfigured } from "@/app/lib/web-push-config";
import { type CronLock, claimCronLock, releaseCronLock } from "@/app/services/api/cron-lock-server";
import { fetchEmailSettings } from "@/app/services/api/email-settings-server";
import { loadEmailTexts } from "@/app/services/api/email-templates-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { isLearnerRole } from "@/app/services/auth/permissions";
import { type EmailContent, isEmailConfigured } from "@/app/services/notifications/email";
import {
  buildAnnouncementEmail,
  buildInactivityReminderEmail,
  buildTrialNurtureEmail,
  buildWeeklyDigestEmail,
} from "@/app/services/notifications/email-templates";
import {
  buildUnsubscribeUrl,
  isUnsubscribeConfigured,
} from "@/app/services/notifications/email-unsubscribe";
import { deliverDigestPushes } from "@/app/services/notifications/push-digest";
import {
  type AdminClient,
  type DeliverResult,
  deliverUserEmail,
} from "@/app/services/notifications/user-emails";
import type { Announcement, ScoreKind, UserRoleType, UserStatusType } from "@/app/types";

/**
 * Extraction and sending for periodic emails (weekly progress, inactivity reminder, guides for
 * trial users). Called from `GET /api/cron/email-digest` (Vercel Cron, daily around 8 AM JST).
 * It is a batch with no user session, so extraction uses the service_role client (per-`user_id`
 * aggregation; not a delivery path that returns contents to students). Learning content reads
 * filter `is_published = true AND is_deleted = false` at every level and select only columns
 * without bodies.
 */

const PAGE_SIZE = 1000;
/** IDs passed to one `.in("user_id", ...)` (keeps the query string short). */
const ID_CHUNK_SIZE = 100;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Pages with range so PostgREST's max rows (`db-max-rows`) does not drop rows. Even if the server
 * max is set below PAGE_SIZE nothing is lost: advance by the number of rows actually returned and
 * keep fetching until 0 rows (never assume "fewer than PAGE_SIZE means last").
 */
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      return rows;
    }
    rows.push(...data);
    offset += data.length;
  }
}

async function fetchForUserIds<T>(
  userIds: number[],
  fetchPage: (ids: number[], from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < userIds.length; i += ID_CHUNK_SIZE) {
    const ids = userIds.slice(i, i + ID_CHUNK_SIZE);
    rows.push(...(await fetchAllPages((from, to) => fetchPage(ids, from, to))));
  }
  return rows;
}

/**
 * Send candidates: active / trial users of any role who have not unsubscribed. Announcements
 * follow the in-app display target, which ignores the role (#322), so an active maintainer who sees
 * an announcement also gets its email; the learning emails narrow to members in buildQueue().
 */
async function fetchDigestUsers(supabase: AdminClient): Promise<DigestUser[]> {
  const rows = await fetchAllPages<{
    id: number;
    email: string;
    notification_email: string | null;
    display_name: string;
    status: string;
    membership_type: string | null;
    role: UserRoleType;
    created_at: string | null;
  }>((from, to) =>
    supabase
      .from("users")
      .select(
        "id, email, notification_email, display_name, status, membership_type, role, created_at"
      )
      .eq("is_deleted", false)
      .in("status", [USER_STATUS.ACTIVE, USER_STATUS.TRIAL])
      .is("email_opt_out_at", null)
      .order("id")
      .range(from, to)
  );

  return rows.flatMap((row) => {
    if (!row.created_at) {
      return [];
    }
    // Periodic mail and announcement broadcasts share this list, so both follow the same address.
    const email = resolveNotificationEmail(row);
    if (!email) {
      return [];
    }
    return [
      {
        userId: row.id,
        email,
        displayName: row.display_name,
        status: row.status as UserStatusType,
        membershipType: row.membership_type ?? null,
        role: row.role,
        createdAt: row.created_at as string,
      },
    ];
  });
}

/**
 * Returns the contents in circulation in learning order (theme -> phase -> content
 * display order). The nested select and the all-levels published/not-deleted filters have the
 * same published filters as fetchThemeProgressSummaries(); ordering uses orderContentsAcrossThemes()
 * (shared with home / review-list).
 */
async function fetchOrderedContents(supabase: AdminClient): Promise<DigestContent[]> {
  const { data, error } = await applyPublishedNestedThemeFilters(
    supabase
      .from("learning_themes")
      .select(
        "id, name, display_order, phases:learning_phases(id, name, display_order, contents:learning_contents(id, title, display_order, is_open_to_trial, phase_id))"
      )
  ).order("display_order");

  if (error) {
    throw new Error(error.message);
  }

  type DigestContentRow = {
    id: number;
    title: string;
    display_order: number | null;
    phase_id: number;
    is_open_to_trial: boolean;
  };
  return orderContentsAcrossThemes((data ?? []) as NestedThemeTree<DigestContentRow>[]).map(
    ({ themeId, themeName, content, raw }) => ({
      id: content.id,
      title: content.title,
      themeId,
      path: `/learn/${themeId}/${content.phaseId}/${content.id}`,
      themeName,
      isOpenToTrial: raw.is_open_to_trial === true,
    })
  );
}

/** IDs of users with at least one learning record (progress row or submission). */
async function fetchUserIdsWithActivity(
  supabase: AdminClient,
  userIds: number[]
): Promise<Set<number>> {
  if (userIds.length === 0) {
    return new Set();
  }
  // View-only user_progress rows (#396) must not count as "started learning".
  const [progress, submissions] = await Promise.all([
    fetchForUserIds<{ user_id: number }>(userIds, (ids, from, to) =>
      supabase
        .from("user_progress")
        .select("user_id")
        .in("user_id", ids)
        .eq("ever_completed", true)
        .order("id")
        .range(from, to)
    ),
    fetchForUserIds<{ user_id: number }>(userIds, (ids, from, to) =>
      supabase.from("submissions").select("user_id").in("user_id", ids).order("id").range(from, to)
    ),
  ]);
  return new Set([...progress, ...submissions].map((row) => row.user_id));
}

/**
 * IDs of users with an `email_logs` row for (kind, reference_key). Used to detect users already
 * sent (or sending / failed) this week's weekly digest and users with this week's carry-over
 * reservation.
 */
async function fetchLoggedUserIds(
  supabase: AdminClient,
  userIds: number[],
  kind: string,
  referenceKey: string
): Promise<Set<number>> {
  const rows = await fetchForUserIds<{ user_id: number }>(userIds, (ids, from, to) =>
    supabase
      .from("email_logs")
      .select("user_id")
      .eq("kind", kind)
      .eq("reference_key", referenceKey)
      .in("user_id", ids)
      .order("id")
      .range(from, to)
  );
  return new Set(rows.map((row) => row.user_id));
}

/**
 * IDs of users who already have a `weekly_digest` row for the 7 days ending at `cycleStart`
 * (reference_key is a date, so a range compare works). Changing the send weekday mid-week shifts
 * the reference_key, so an exact-key check would send a second digest for the same week; any row
 * within the window counts as this cycle's digest.
 */
async function fetchWeeklyDigestLoggedUserIds(
  supabase: AdminClient,
  userIds: number[],
  cycleStart: string
): Promise<Set<number>> {
  const rows = await fetchForUserIds<{ user_id: number }>(userIds, (ids, from, to) =>
    supabase
      .from("email_logs")
      .select("user_id")
      .eq("kind", EMAIL_KIND.WEEKLY_DIGEST)
      .gte("reference_key", addDays(cycleStart, -6))
      .lte("reference_key", cycleStart)
      .in("user_id", ids)
      .order("id")
      .range(from, to)
  );
  return new Set(rows.map((row) => row.user_id));
}

type WeeklyStats = {
  completedIdsByUser: Map<number, Set<number>>;
  /** contentId -> completed_at (epoch ms) per user, to find the most recently studied theme. */
  completedAtByUser: Map<number, Map<number, number>>;
  completedLastWeekByUser: Map<number, number>;
  submittedLastWeekByUser: Map<number, number>;
};

/**
 * Weekly aggregation: per user, completed contents (to decide the next content) and last week's
 * completed and submission counts (JST calendar days [lastWeekStart, weekStart)).
 */
async function fetchWeeklyStats(
  supabase: AdminClient,
  userIds: number[],
  weekStart: string
): Promise<WeeklyStats> {
  const from = jstStartOfDayIso(addDays(weekStart, -7));
  const to = jstStartOfDayIso(weekStart);

  const [progress, submissions] = await Promise.all([
    fetchForUserIds<{ user_id: number; content_id: number; completed_at: string | null }>(
      userIds,
      (ids, start, end) =>
        supabase
          .from("user_progress")
          .select("user_id, content_id, completed_at")
          .eq("is_completed", true)
          .in("user_id", ids)
          .order("id")
          .range(start, end)
    ),
    fetchForUserIds<{ user_id: number }>(userIds, (ids, start, end) =>
      supabase
        .from("submissions")
        .select("user_id")
        .gte("submitted_at", from)
        .lt("submitted_at", to)
        .in("user_id", ids)
        .order("id")
        .range(start, end)
    ),
  ]);

  const stats: WeeklyStats = {
    completedIdsByUser: new Map(),
    completedAtByUser: new Map(),
    completedLastWeekByUser: new Map(),
    submittedLastWeekByUser: new Map(),
  };
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  for (const row of progress) {
    const ids = stats.completedIdsByUser.get(row.user_id) ?? new Set<number>();
    ids.add(row.content_id);
    stats.completedIdsByUser.set(row.user_id, ids);
    const completedAt = row.completed_at ? Date.parse(row.completed_at) : Number.NaN;
    if (!Number.isNaN(completedAt)) {
      const times = stats.completedAtByUser.get(row.user_id) ?? new Map<number, number>();
      times.set(row.content_id, completedAt);
      stats.completedAtByUser.set(row.user_id, times);
    }
    if (completedAt >= fromMs && completedAt < toMs) {
      stats.completedLastWeekByUser.set(
        row.user_id,
        (stats.completedLastWeekByUser.get(row.user_id) ?? 0) + 1
      );
    }
  }
  for (const row of submissions) {
    stats.submittedLastWeekByUser.set(
      row.user_id,
      (stats.submittedLastWeekByUser.get(row.user_id) ?? 0) + 1
    );
  }
  return stats;
}

/**
 * Unovercome review-list counts for weekly digest body lines. Cron has no user session, so this
 * reads ai_reviews.review_json via service_role with an explicit user_id filter (documented
 * exception in specification.md 10.7 / 15.5 — not a student delivery path). Fail-soft: log and
 * return 0 counts so a review_json read failure cannot abort the whole digest. Counts only items
 * on published/visible contents (same filter as /review-list).
 */
async function fetchUnovercomeReviewCountsByUser(
  supabase: AdminClient,
  users: DigestUser[],
  contents: DigestContent[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const user of users) {
    counts.set(user.userId, 0);
  }
  if (users.length === 0) {
    return counts;
  }

  try {
    const reviewsByUser = new Map<number, ReviewListSourceReview[]>();
    // PostgREST types the !inner embed as an array; runtime is to-one (UNIQUE submission_id).
    type DigestReviewRow = {
      user_id: number;
      content_id: number;
      ai_review: {
        id: number;
        score_kind: string;
        review_json: unknown;
        reviewed_at: string | null;
        created_at: string;
      } | null;
    };
    const userIds = users.map((user) => user.userId);
    // Only columns needed to derive counts (no review_content / advice prose beyond review_json).
    const rows = await fetchForUserIds<DigestReviewRow>(
      userIds,
      (ids, from, to) =>
        supabase
          .from("submissions")
          .select(
            "user_id, content_id, ai_review:ai_reviews!inner(id, score_kind, review_json, reviewed_at, created_at, status)"
          )
          .in("user_id", ids)
          .eq("ai_review.status", "completed")
          .order("id")
          .range(from, to) as unknown as PromiseLike<Page<DigestReviewRow>>
    );

    for (const row of rows) {
      const aiReview = row.ai_review;
      if (!aiReview) continue;
      const list = reviewsByUser.get(row.user_id) ?? [];
      list.push({
        id: aiReview.id,
        contentId: row.content_id,
        scoreKind: aiReview.score_kind as ScoreKind,
        reviewJson: aiReview.review_json,
        reviewedAt: aiReview.reviewed_at ?? aiReview.created_at,
      });
      reviewsByUser.set(row.user_id, list);
    }

    for (const user of users) {
      const visibleIds = new Set(
        visibleContentsFor(contents, user.status).map((content) => content.id)
      );
      const items = filterReviewItemsToVisibleContents(
        deriveReviewListItems(reviewsByUser.get(user.userId) ?? []),
        visibleIds
      );
      counts.set(user.userId, countUnovercomeReviewItems(items));
    }
    return counts;
  } catch (error) {
    console.error(
      "[定期メール] 復習リスト未克服件数の取得に失敗したため 0 件として続行します:",
      error
    );
    return counts;
  }
}

/**
 * Send logs of promotional emails claimed today (from JST 0:00). Used to keep the daily cap and
 * "one per user per day" across runs (same-day reruns, duplicate Cron starts, manual curl).
 */
async function fetchTodayPromotionalLogs(
  supabase: AdminClient,
  today: string
): Promise<{ count: number; userIds: Set<number> }> {
  const rows = await fetchAllPages<{ user_id: number }>((from, to) =>
    supabase
      .from("email_logs")
      .select("user_id")
      .in("kind", [...PROMOTIONAL_EMAIL_KINDS])
      .gte("created_at", jstStartOfDayIso(today))
      .order("id")
      .range(from, to)
  );
  return { count: rows.length, userIds: new Set(rows.map((row) => row.user_id)) };
}

/**
 * Whether any carry-over reservation exists for this week (i.e. Monday's run reached target
 * selection).
 */
async function hasWeeklyDigestReservation(
  supabase: AdminClient,
  weekStart: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_logs")
    .select("user_id")
    .eq("kind", WEEKLY_DIGEST_RESERVATION_KIND)
    .eq("reference_key", weekStart)
    .limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).length > 0;
}

/**
 * Records users selected for Monday's weekly digest as carry-over reservations (no-op if
 * present). The reservation is a precondition for sending: throw on failure (the caller returns
 * failure without sending anything). It happens before the claim, so rerunning cannot double send
 * and can restart from the reservation.
 */
async function reserveWeeklyDigest(
  supabase: AdminClient,
  userIds: number[],
  weekStart: string
): Promise<void> {
  for (let i = 0; i < userIds.length; i += ID_CHUNK_SIZE) {
    const { error } = await supabase.from("email_logs").upsert(
      userIds.slice(i, i + ID_CHUNK_SIZE).map((userId) => ({
        user_id: userId,
        kind: WEEKLY_DIGEST_RESERVATION_KIND,
        reference_key: weekStart,
      })),
      { onConflict: "user_id,kind,reference_key", ignoreDuplicates: true }
    );
    if (error) {
      throw new Error(`週次進捗の繰り越し予約に失敗しました: ${error.message}`);
    }
  }
}

type PendingAnnouncement = Pick<
  Announcement,
  | "id"
  | "title"
  | "body"
  | "target_statuses"
  | "target_membership_types"
  | "published_at"
  | "updated_at"
>;

/**
 * Announcements waiting for bulk email (published, not deleted, `send_email`, not yet sent to
 * everyone), oldest published first.
 * Periodic-email extraction is supposed to select only columns without bodies (AGENTS.md
 * "membership types / trial users"), but an announcement body is the email body itself, written
 * by staff to reach all students, so `body` is selected as an exception (learning content bodies
 * are still never selected).
 */
async function fetchPendingAnnouncements(supabase: AdminClient): Promise<PendingAnnouncement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, target_statuses, target_membership_types, published_at, updated_at")
    .not("published_at", "is", null)
    .eq("is_deleted", false)
    .eq("send_email", true)
    .is("email_sent_at", null)
    .order("published_at");
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as PendingAnnouncement[];
}

type AnnouncementLog = {
  id: number;
  user_id: number;
  reference_key: string;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

/** `email_logs` rows of the announcement bulk send (sent, sending, failed). */
async function fetchAnnouncementLogs(
  supabase: AdminClient,
  referenceKeys: string[]
): Promise<AnnouncementLog[]> {
  return fetchAllPages<AnnouncementLog>((from, to) =>
    supabase
      .from("email_logs")
      .select("id, user_id, reference_key, sent_at, error, created_at")
      .eq("kind", EMAIL_KIND.ANNOUNCEMENT)
      .in("reference_key", referenceKeys)
      .order("id")
      .range(from, to)
  );
}

/**
 * Whether a failure should be resent (as of run day `day`): failures certain to have been
 * rejected by Resend (`status=429` / `5xx`) within `ANNOUNCEMENT_EMAIL_RETRY_DAYS` of the publish
 * date (JST). Failures where it is unknown whether it was sent (e.g. timeout) and rows left in
 * "sending" without a recorded result are not resent, to avoid double sending.
 */
function isRetryableFailure(log: AnnouncementLog, publishedAt: string, day: string): boolean {
  return (
    log.sent_at === null &&
    log.error !== null &&
    RETRYABLE_EMAIL_ERROR.test(log.error) &&
    daysBetween(toJstDateString(new Date(publishedAt)), day) <= ANNOUNCEMENT_EMAIL_RETRY_DAYS
  );
}

/**
 * Per announcement: IDs of users whose send is finished (sent, or a failure that will not be
 * resent, or a sending row) and the failure rows treated as not finished (rows where
 * `isRetryable` is true).
 */
function classifyAnnouncementLogs(
  logs: AnnouncementLog[],
  isRetryable: (log: AnnouncementLog) => boolean
): { done: Map<string, Set<number>>; retryable: AnnouncementLog[] } {
  const done = new Map<string, Set<number>>();
  const retryable: AnnouncementLog[] = [];
  for (const log of logs) {
    if (isRetryable(log)) {
      retryable.push(log);
      continue;
    }
    const ids = done.get(log.reference_key) ?? new Set<number>();
    ids.add(log.user_id);
    done.set(log.reference_key, ids);
  }
  return { done, retryable };
}

/** Bulk send progress; `email_sent_at` is recorded once this run has processed everyone. */
type AnnouncementBatch = {
  id: number;
  referenceKey: string;
  publishedAt: string;
  /**
   * `updated_at` of the announcement used for the target decision (not completed if edited during
   * the send).
   */
  updatedAt: string;
  /**
   * Targets not yet finished at the start of this run (no `email_logs` row, or only failure rows
   * to resend).
   */
  pendingUserIds: number[];
};

/** One queued email; the body is built right before sending. */
type QueuedEmail = {
  kind: PromotionalEmailKind;
  referenceKey: string;
  user: DigestUser;
  build: (unsubscribeUrl: string) => EmailContent;
  /**
   * Whether it carries over to the following days' runs of the same week when not sent due to the
   * cap / time limit.
   */
  carriesOver: boolean;
};

export type EmailDigestResult =
  | { status: "skipped"; reason: string }
  | { status: "failed" }
  | {
      status: "completed";
      date: string;
      queued: number;
      sent: number;
      failed: number;
      duplicate: number;
      skipped: number;
      /**
       * Number not sent this run because of the cap / time limit (weekly digests among them carry
       * over to the following days).
       */
      deferred: number;
      /**
       * Weekly digest was skipped because this week has no reservation and the catch-up window
       * passed (Monday and Tuesday runs did not complete).
       */
      weeklyReservationMissing: boolean;
      /**
       * Number of announcements whose targets were all sent in this run (`email_sent_at`
       * recorded).
       */
      announcementsCompleted: number;
    };

export type EmailDigestOptions = {
  now?: Date;
  /** Time measurement (replaceable in tests). */
  clock?: () => number;
  /** Send interval wait (replaceable in tests). */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Decides which user is claimed by which announcement in this run: a sendable user not yet queued
 * is claimed by the first announcement (in order) that targets them, has not finished for them and
 * has no failure row blocking the `<referenceKey>:<userId>` pair.
 */
function assignAnnouncementClaims(
  announcements: PendingAnnouncement[],
  allUsers: DigestUser[],
  sendableUserIds: ReadonlySet<number>,
  queuedUserIds: ReadonlySet<number>,
  done: ReadonlyMap<string, ReadonlySet<number>>,
  blockedKeys: ReadonlySet<string>
): Map<string, Set<number>> {
  const claims = new Map<string, Set<number>>();
  const claimed = new Set<number>();
  for (const announcement of announcements) {
    const referenceKey = String(announcement.id);
    const doneUserIds = done.get(referenceKey);
    const ids = new Set<number>();
    for (const user of allUsers) {
      if (
        sendableUserIds.has(user.userId) &&
        !queuedUserIds.has(user.userId) &&
        !claimed.has(user.userId) &&
        !doneUserIds?.has(user.userId) &&
        !blockedKeys.has(`${referenceKey}:${user.userId}`) &&
        isAnnouncementTarget(announcement, {
          status: user.status,
          membershipType: user.membershipType,
        })
      ) {
        claimed.add(user.userId);
        ids.add(user.userId);
      }
    }
    claims.set(referenceKey, ids);
  }
  return claims;
}

/**
 * Adds the announcement bulk email to the send queue (kind = `announcement`, reference_key =
 * announcement ID). Targets are non-unsubscribed users of any role whose status / membership type
 * match the announcement target (`isAnnouncementTarget()`, same condition as in-app display).
 * When everyone cannot be sent in one run (daily cap, run time, one per user per day), unfinished
 * users are sent in following days (split sending). Users who already received a promotional
 * email today (not in `sendableUserIds`) and users receiving another guide in this run are
 * deferred to the next day. Failures to resend from before today (`isRetryableFailure()`) have
 * their rows deleted first so the `email_logs` UNIQUE constraint lets them be claimed again;
 * recipients whose row could not be deleted are not sent this run and do not complete it.
 * Returns every unfinished target (from `allUsers`) for the completion decision.
 */
async function appendAnnouncementEmails(
  supabase: AdminClient,
  allUsers: DigestUser[],
  sendableUserIds: ReadonlySet<number>,
  queuedUserIds: Set<number>,
  queue: QueuedEmail[],
  appUrl: string,
  today: string,
  texts: EmailTexts
): Promise<AnnouncementBatch[]> {
  const announcements = await fetchPendingAnnouncements(supabase);
  if (announcements.length === 0) {
    return [];
  }
  const publishedAt = new Map(
    announcements.map((announcement) => [
      String(announcement.id),
      announcement.published_at as string,
    ])
  );
  // Only failures from before today are resent today. Deleting a failed row from today on a
  // same-day rerun would drop it from today's promotional count (daily cap, one per user per
  // day). Failures to resend on following days (including today's) are treated as unfinished and
  // keep the announcement incomplete.
  const startOfToday = jstStartOfDayIso(today);
  const tomorrow = addDays(today, 1);
  const retryNow = (log: AnnouncementLog) =>
    isBefore(log.created_at, startOfToday) &&
    isRetryableFailure(log, publishedAt.get(log.reference_key) as string, today);
  const { done, retryable } = classifyAnnouncementLogs(
    await fetchAnnouncementLogs(supabase, [...publishedAt.keys()]),
    (log) =>
      retryNow(log) ||
      isRetryableFailure(log, publishedAt.get(log.reference_key) as string, tomorrow)
  );
  // Delete only rows of recipients claimed in this run. Deleting the row of a user who cannot be
  // sent today (already mailed, or queued for another guide) would erase the failure record from
  // /admin/emails without any resend. The claim assignment is computed once and consumed by the
  // queuing below, so the deletion and the sending cannot disagree.
  const keyOf = (log: AnnouncementLog) => `${log.reference_key}:${log.user_id}`;
  const assign = (blockedKeys: ReadonlySet<string>) =>
    assignAnnouncementClaims(
      announcements,
      allUsers,
      sendableUserIds,
      queuedUserIds,
      done,
      blockedKeys
    );
  // Recipients not sent today: those with failures to resend on following days, those who cannot
  // be claimed today, and those whose failure row could not be deleted (the claim would hit the
  // UNIQUE violation). They stay unfinished, so completion is not recorded either.
  let claims = assign(new Set(retryable.filter((log) => !retryNow(log)).map(keyOf)));
  const deletableIds = retryable
    .filter((log) => retryNow(log) && claims.get(log.reference_key)?.has(log.user_id))
    .map((log) => log.id);
  const deletedIds = new Set<number>(deletableIds);
  if (deletableIds.length > 0) {
    const { error } = await supabase.from("email_logs").delete().in("id", deletableIds);
    if (error) {
      console.error("[定期メール] お知らせの送信失敗の行を削除できませんでした:", error.message);
      deletedIds.clear();
      claims = assign(new Set(retryable.map(keyOf)));
    }
  }
  const blocked = new Map<string, Set<number>>();
  for (const log of retryable) {
    if (deletedIds.has(log.id)) {
      continue;
    }
    const ids = blocked.get(log.reference_key) ?? new Set<number>();
    ids.add(log.user_id);
    blocked.set(log.reference_key, ids);
  }

  return announcements.map((announcement) => {
    const referenceKey = String(announcement.id);
    const doneUserIds = done.get(referenceKey) ?? new Set<number>();
    const blockedUserIds = blocked.get(referenceKey) ?? new Set<number>();
    // Convert the body once per announcement (reused across recipients).
    let body: EmailMarkdown | null = null;
    const renderedBody = () => {
      body ??= renderEmailMarkdown(announcement.body);
      return body;
    };
    const pending = allUsers.filter(
      (user) =>
        !doneUserIds.has(user.userId) &&
        isAnnouncementTarget(announcement, {
          status: user.status,
          membershipType: user.membershipType,
        })
    );

    const claimedUserIds = claims.get(referenceKey);
    for (const user of pending) {
      if (!claimedUserIds?.has(user.userId) || blockedUserIds.has(user.userId)) {
        continue;
      }
      queue.push({
        kind: EMAIL_KIND.ANNOUNCEMENT,
        referenceKey,
        user,
        carriesOver: true,
        build: (unsubscribeUrl) =>
          buildAnnouncementEmail(
            {
              displayName: user.displayName,
              appUrl,
              unsubscribeUrl,
              announcementId: announcement.id,
              title: announcement.title,
              body: renderedBody(),
            },
            texts
          ),
      });
      queuedUserIds.add(user.userId);
    }

    return {
      id: announcement.id,
      referenceKey,
      publishedAt: announcement.published_at as string,
      updatedAt: announcement.updated_at,
      pendingUserIds: pending.map((u) => u.userId),
    };
  });
}

/**
 * Builds the send queue. First, `trial_nurture` / `inactivity_reminder` for users on their Nth
 * day since registration today (JST), since the Nth-day guide is not picked up the next day; when
 * the cap is hit, carry-over-capable announcements / weekly digests are pushed back. After that,
 * on days that decide weekly targets: announcement bulk send -> `weekly_digest`; otherwise
 * carry-over `weekly_digest` -> announcements (a weekly reservation is valid only within its
 * week). At most one promotional email per user per day (users who already claimed one today,
 * `excludedToday`, are skipped).
 */
async function buildQueue(
  supabase: AdminClient,
  allUsers: DigestUser[],
  excludedToday: ReadonlySet<number>,
  today: string,
  appUrl: string,
  settings: EmailSettingsSnapshot,
  texts: EmailTexts
): Promise<{
  queue: QueuedEmail[];
  weeklyReservationMissing: boolean;
  announcementBatches: AnnouncementBatch[];
}> {
  const users = allUsers.filter((user) => !excludedToday.has(user.userId));
  // Staff review the courses rather than take them; progress nudges and trial guides would be
  // noise to them, so only announcements reach them.
  const learners = users.filter((user) => isLearnerRole(user.role));
  const trialNurtureSetting = settings.kinds.trial_nurture;
  const inactivitySetting = settings.kinds.inactivity_reminder;
  const weeklySetting = settings.kinds.weekly_digest;
  const announcementEnabled = settings.kinds.announcement.enabled;
  if (users.length === 0) {
    // Return the bulk send state even with no sendable users, so announcements with no targets
    // can be completed.
    const announcementBatches = announcementEnabled
      ? await appendAnnouncementEmails(
          supabase,
          allUsers,
          new Set(),
          new Set(),
          [],
          appUrl,
          today,
          texts
        )
      : [];
    return { queue: [], weeklyReservationMissing: false, announcementBatches };
  }

  const contents = await fetchOrderedContents(supabase);
  const upgradeAvailable = isStripeEnabled();
  const queue: QueuedEmail[] = [];
  const queuedUserIds = new Set<number>();

  const { trialNurture, inactivityCandidates } = planMilestoneEmails(learners, today, {
    trialNurture: trialNurtureSetting.enabled ? trialNurtureSetting.sendDays : null,
    inactivityReminder: inactivitySetting.enabled ? inactivitySetting.sendDays : null,
  });
  const finalNurtureDay = Math.max(...(trialNurtureSetting.sendDays ?? [0]));
  for (const { user, day } of trialNurture) {
    queue.push({
      kind: EMAIL_KIND.TRIAL_NURTURE,
      referenceKey: `day${day}`,
      user,
      carriesOver: false,
      build: (unsubscribeUrl) =>
        buildTrialNurtureEmail(
          {
            displayName: user.displayName,
            appUrl,
            unsubscribeUrl,
            day,
            isFinal: day === finalNurtureDay,
            upgradeAvailable,
            lockedThemeNames: lockedThemeNames(contents),
          },
          texts
        ),
    });
    queuedUserIds.add(user.userId);
  }

  const active = await fetchUserIdsWithActivity(
    supabase,
    inactivityCandidates.map(({ user }) => user.userId)
  );
  for (const { user, day } of inactivityCandidates) {
    if (active.has(user.userId)) {
      continue;
    }
    const [first] = visibleContentsFor(contents, user.status);
    queue.push({
      kind: EMAIL_KIND.INACTIVITY_REMINDER,
      referenceKey: `day${day}`,
      user,
      carriesOver: false,
      build: (unsubscribeUrl) =>
        buildInactivityReminderEmail(
          {
            displayName: user.displayName,
            appUrl,
            unsubscribeUrl,
            firstContent: first ? { title: first.title, path: first.path } : null,
          },
          texts
        ),
    });
    queuedUserIds.add(user.userId);
  }

  // Weekly digest (reference_key is the week start date). Only Monday decides targets and records
  // them as carry-over reservations. Tuesday to Sunday send only to users who hold a reservation
  // but were not sent (missed on Monday due to cap / time limit / another guide that day); users
  // who became eligible mid-week are not sent. If this week has no reservation at all (Monday's
  // run never reached target selection), runs up to `WEEKLY_DIGEST_CATCH_UP_DAYS` (Tuesday)
  // decide targets in Monday's place. Users who registered partway through last week have no
  // complete "last week" and are skipped.
  const weekStart = cycleStartOf(today, weeklySetting.sendWeekday as number);
  const daysSinceWeekStart = daysBetween(weekStart, today);
  const weeklyEnabled = weeklySetting.enabled;
  let decidesTargets = weeklyEnabled && daysSinceWeekStart === 0;
  let weeklyReservationMissing = false;
  let weeklySkipped = false;
  if (
    weeklyEnabled &&
    !decidesTargets &&
    !(await hasWeeklyDigestReservation(supabase, weekStart))
  ) {
    // The deciding run of this cycle did not reach target selection (failure, skip, missed start).
    // Within the catch-up window today's run decides targets in its place; after that nothing is
    // sent so it gets noticed. Exception: if the setting itself changed during this cycle (send
    // weekday moved, the kind re-enabled, or the global switch turned on), the cycle never had a
    // scheduled deciding day, so sends resume next cycle. Judged by the update timestamps rather
    // than by past log rows, which would also hide a genuine failure of the new cycle's deciding
    // runs; both timestamps move only on a real change (same-value saves are not written).
    const cycleStart = jstStartOfDayIso(weekStart);
    if (daysSinceWeekStart <= WEEKLY_DIGEST_CATCH_UP_DAYS) {
      decidesTargets = true;
      console.warn(
        `[定期メール] 今週（${weekStart}）の週次進捗の予約が無いため、今日の実行で対象を決めて送ります`
      );
    } else if (
      isSameOrAfter(weeklySetting.updatedAt, cycleStart) ||
      (settings.sendingUpdatedAt !== null && isSameOrAfter(settings.sendingUpdatedAt, cycleStart))
    ) {
      weeklySkipped = true;
      console.warn(
        `[定期メール] 週次進捗の設定が今サイクル（${weekStart}〜）の途中で変更された（または全体スイッチが切り替えられた）ため、今回は週次進捗を送りません（次の送信日から再開します）`
      );
    } else {
      weeklyReservationMissing = true;
      console.warn(
        `[定期メール] 今週（${weekStart}）の週次進捗の予約が無いため、週次進捗は送りません（送信曜日の当日と翌日の実行が完了しなかった可能性があります）`
      );
    }
  }
  let weeklyPool = weeklyEnabled
    ? learners.filter((user) => coversPreviousWeek(user.createdAt, weekStart))
    : [];
  const poolIds = () => weeklyPool.map((user) => user.userId);
  if (weeklyReservationMissing || weeklySkipped) {
    weeklyPool = [];
  } else if (!decidesTargets) {
    const reserved = await fetchLoggedUserIds(
      supabase,
      poolIds(),
      WEEKLY_DIGEST_RESERVATION_KIND,
      weekStart
    );
    weeklyPool = weeklyPool.filter((user) => reserved.has(user.userId));
  }
  const logged = await fetchWeeklyDigestLoggedUserIds(supabase, poolIds(), weekStart);
  const weeklyUsers = weeklyPool.filter((user) => !logged.has(user.userId));
  const weeklyUserIds = weeklyUsers.map((user) => user.userId);
  const [stats, unovercomeByUser] = await Promise.all([
    fetchWeeklyStats(supabase, weeklyUserIds, weekStart),
    fetchUnovercomeReviewCountsByUser(supabase, weeklyUsers, contents),
  ]);

  const weeklyItems: QueuedEmail[] = [];
  for (const user of weeklyUsers) {
    const completedLastWeek = stats.completedLastWeekByUser.get(user.userId) ?? 0;
    const submittedLastWeek = stats.submittedLastWeekByUser.get(user.userId) ?? 0;
    const { next, remaining, activeThemes } = resolveNextContent(
      visibleContentsFor(contents, user.status),
      stats.completedIdsByUser.get(user.userId) ?? new Set(),
      stats.completedAtByUser.get(user.userId)
    );
    if (
      !isWeeklyDigestTarget({ completedLastWeek, submittedLastWeek, remainingContents: remaining })
    ) {
      continue;
    }
    weeklyItems.push({
      kind: EMAIL_KIND.WEEKLY_DIGEST,
      referenceKey: weekStart,
      user,
      // A reservation is valid only within the week, so what could not be sent by the last day
      // (Sunday) is lost.
      carriesOver: daysSinceWeekStart < 6,
      build: (unsubscribeUrl) =>
        buildWeeklyDigestEmail(
          {
            displayName: user.displayName,
            appUrl,
            unsubscribeUrl,
            completedLastWeek,
            submittedLastWeek,
            nextContent: next ? { title: next.title, path: next.path } : null,
            remainingContents: remaining,
            activeThemes,
            unovercomeReviewCount: unovercomeByUser.get(user.userId) ?? 0,
          },
          texts
        ),
    });
  }

  if (decidesTargets) {
    await reserveWeeklyDigest(
      supabase,
      weeklyItems.map((item) => item.user.userId),
      weekStart
    );
  }
  // For users receiving a Nth-day guide today, push the weekly digest to following days (it
  // carries over because it is reserved).
  const pushWeekly = () => {
    for (const item of weeklyItems) {
      if (!queuedUserIds.has(item.user.userId)) {
        queue.push(item);
        queuedUserIds.add(item.user.userId);
      }
    }
  };
  const appendAnnouncements = async (): Promise<AnnouncementBatch[]> =>
    announcementEnabled
      ? appendAnnouncementEmails(
          supabase,
          allUsers,
          new Set(users.map((user) => user.userId)),
          queuedUserIds,
          queue,
          appUrl,
          today,
          texts
        )
      : [];

  // On days deciding targets (Monday, including catch-up Tuesday) put announcements first and
  // carry the weekly digest to following days (the reservation lets it go out on the rest of the
  // week). On other days the weekly digest is only the reserved carry-over and a reservation is
  // valid only within its week, so it goes before announcements, which have no carry-over
  // deadline (so a large announcement using up the cap cannot push the weekly digest to the
  // weekend and lose it).
  let announcementBatches: AnnouncementBatch[];
  if (decidesTargets) {
    announcementBatches = await appendAnnouncements();
    pushWeekly();
  } else {
    pushWeekly();
    announcementBatches = await appendAnnouncements();
  }

  return { queue, weeklyReservationMissing, announcementBatches };
}

/**
 * Decides and sends every periodic email due today.
 * - Exclusive runs: only the run that took the run lock (`cron_locks`, claimCronLock()) proceeds.
 *   Duplicate Cron starts / manual runs later return `skipped` without doing anything.
 * - No double sending: each email claims `(user_id, kind, reference_key)` in `email_logs` before
 *   sending (deliverUserEmail()); a same-day rerun hits the UNIQUE violation and sends nothing.
 * - One per user per day: users who already claimed a promotional email today are excluded on
 *   same-day reruns (no second email of another kind even if status changed after the morning
 *   run).
 * - Daily cap: `email_settings.digest_daily_limit` minus promotional emails already claimed today is this
 *   run's limit; stop when attempted sends reach it or elapsed time exceeds
 *   `EMAIL_DIGEST_TIME_BUDGET_MS`. The remainder is logged, and weekly digests are sent in
 *   following days of the same week.
 * - Unsubscribe: extraction filters `email_opt_out_at IS NULL` and every email footer has an
 *   unsubscribe link.
 * Does nothing when sending settings (`RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` /
 * `NEXT_PUBLIC_APP_URL`) or `EMAIL_UNSUBSCRIBE_SECRET` are missing (promotional emails without an
 * unsubscribe link are never sent), or when the global switch (`email_settings.sending_enabled`)
 * is off; an unreadable switch fails the run like any other unreadable setting.
 */
export async function runEmailDigest(options: EmailDigestOptions = {}): Promise<EmailDigestResult> {
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = clock();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const emailSkipReason = !isEmailConfigured()
    ? "RESEND_API_KEY または EMAIL_FROM_ADDRESS が未設定です"
    : !appUrl
      ? "NEXT_PUBLIC_APP_URL が未設定です"
      : !isUnsubscribeConfigured()
        ? "EMAIL_UNSUBSCRIBE_SECRET が未設定です"
        : null;
  // Push does not need Resend, but it shares this lock so two crons cannot deliver twice.
  if (emailSkipReason && !isWebPushConfigured()) {
    return skip(emailSkipReason);
  }

  const today = toJstDateString(options.now ?? new Date());

  let supabase: AdminClient;
  let lock: CronLock | null;
  try {
    supabase = await createAdminSupabaseClient();
    lock = await claimCronLock(supabase, EMAIL_DIGEST_LOCK_NAME, EMAIL_DIGEST_LOCK_TTL_MS);
  } catch (error) {
    console.error(
      "[定期メール] 実行ロックの取得でエラーが発生しました:",
      error instanceof Error ? error.message : error
    );
    return { status: "failed" };
  }
  if (!lock) {
    return skip("別の実行が進行中です");
  }

  // Before sendDigest / deliverDigestPushes write completion stamps. Push uses push_sent_at
  // (independent of email_sent_at) so a crash after mail completion still retries, while earlier
  // push completions stay out and do not pile onto new subscribers.
  const announcementSentSince = new Date().toISOString();
  try {
    const emailResult = emailSkipReason
      ? skip(emailSkipReason)
      : await sendDigest(supabase, today, appUrl as string, { clock, sleep, startedAt });
    if (isWebPushConfigured()) {
      await deliverDigestPushes(supabase, today, announcementSentSince, clock);
    }
    return emailResult;
  } finally {
    await releaseCronLock(supabase, lock);
  }
}

/** Body from extraction to sending; called only by the run that took the lock. */
async function sendDigest(
  supabase: AdminClient,
  today: string,
  appUrl: string,
  timing: { clock: () => number; sleep: (ms: number) => Promise<void>; startedAt: number }
): Promise<EmailDigestResult> {
  const { clock, sleep, startedAt } = timing;

  let queue: QueuedEmail[];
  let weeklyReservationMissing: boolean;
  let announcementBatches: AnnouncementBatch[];
  let limit: number;
  let dailyLimit: number;
  try {
    // Read on every run and fail closed: if the settings cannot be read, nothing is sent.
    const settings = await fetchEmailSettings(supabase);
    if (!settings.sendingEnabled) {
      return skip("全体スイッチが無効です");
    }
    dailyLimit = settings.digestDailyLimit;
    // Read the email text once per run (never per recipient). It never throws: an unreadable text
    // falls back to the code defaults instead of stopping the run.
    const texts = await loadEmailTexts(supabase);
    const todayLogs = await fetchTodayPromotionalLogs(supabase, today);
    limit = Math.max(0, dailyLimit - todayLogs.count);
    ({ queue, weeklyReservationMissing, announcementBatches } = await buildQueue(
      supabase,
      await fetchDigestUsers(supabase),
      todayLogs.userIds,
      today,
      appUrl,
      settings,
      texts
    ));
  } catch (error) {
    console.error(
      "[定期メール] 送信対象の抽出でエラーが発生しました:",
      error instanceof Error ? error.message : error
    );
    return { status: "failed" };
  }

  const counts: Record<DeliverResult, number> = { sent: 0, failed: 0, duplicate: 0, skipped: 0 };
  let lastApiCallAt: number | null = null;
  let index = 0;

  for (; index < queue.length; index++) {
    const attempted = counts.sent + counts.failed;
    if (attempted >= limit || clock() - startedAt >= EMAIL_DIGEST_TIME_BUDGET_MS) {
      break;
    }
    if (lastApiCallAt !== null) {
      const wait = EMAIL_DIGEST_SEND_INTERVAL_MS - (clock() - lastApiCallAt);
      if (wait > 0) {
        await sleep(wait);
      }
    }

    const item = queue[index];
    const unsubscribeUrl = buildUnsubscribeUrl(appUrl, item.user.userId);
    if (!unsubscribeUrl) {
      counts.skipped++;
      continue;
    }

    const callStartedAt = clock();
    let result: DeliverResult;
    try {
      result = await deliverUserEmail(supabase, {
        kind: item.kind,
        referenceKey: item.referenceKey,
        recipient: {
          userId: item.user.userId,
          email: item.user.email,
          displayName: item.user.displayName,
        },
        content: item.build(unsubscribeUrl),
      });
    } catch (error) {
      console.error(`[定期メール] 予期しないエラーが発生しました: kind=${item.kind}`, error);
      result = "failed";
    }
    counts[result]++;
    if (result === "sent" || result === "failed") {
      lastApiCallAt = callStartedAt;
    }
  }

  const announcementsCompleted = await markCompletedAnnouncements(
    supabase,
    announcementBatches,
    today
  );

  const rest = queue.slice(index);
  if (rest.length > 0) {
    const carried = rest.filter((item) => item.carriesOver).length;
    console.warn(
      `[定期メール] 1日の上限（${dailyLimit}通）または実行時間の上限に達したため、${rest.length}通を送りませんでした（お知らせ・週次進捗 ${carried}通は翌日以降に繰り越し、登録からN日目の案内と週の最終日の週次進捗 ${rest.length - carried}通は繰り越しません）`
    );
  }

  return {
    status: "completed",
    date: today,
    queued: queue.length,
    ...counts,
    deferred: rest.length,
    weeklyReservationMissing,
    announcementsCompleted,
  };
}

/**
 * Records `email_sent_at` on announcements whose targets unfinished at the start of the run are
 * now all finished (sent, or hold a failure that will not be resent, or a sending row in
 * `email_logs`), i.e. completes the bulk send. It re-queries `email_logs` instead of trusting the
 * send loop result, so it does not complete when a target remains: a claim that failed with a DB
 * error, a send that threw (no row created), or a failure still in the resend window. Targets who
 * already got another guide today or were not reached because of the cap / time limit likewise
 * remain, and following days' runs continue. Announcements with no targets are also completed
 * here.
 * An announcement edited from the admin screen during the run (`updated_at` changed) is not
 * completed: if the edit widened the targets, completing on the start-of-run targets would skip
 * the widened ones (the next day's run re-decides with the new targets). Re-query / record
 * failures are only logged (the next day's run can re-decide).
 */
async function markCompletedAnnouncements(
  supabase: AdminClient,
  batches: AnnouncementBatch[],
  today: string
): Promise<number> {
  if (batches.length === 0) {
    return 0;
  }
  let done: Map<string, Set<number>>;
  try {
    // Do not complete while failures to resend on following days (including today's) remain.
    const publishedAt = new Map(batches.map((batch) => [batch.referenceKey, batch.publishedAt]));
    const tomorrow = addDays(today, 1);
    ({ done } = classifyAnnouncementLogs(
      await fetchAnnouncementLogs(supabase, [...publishedAt.keys()]),
      (log) => isRetryableFailure(log, publishedAt.get(log.reference_key) as string, tomorrow)
    ));
  } catch (error) {
    console.error(
      "[定期メール] お知らせの送信状況の確認に失敗しました:",
      error instanceof Error ? error.message : error
    );
    return 0;
  }

  let completed = 0;
  for (const batch of batches) {
    const doneUserIds = done.get(batch.referenceKey) ?? new Set<number>();
    if (!batch.pendingUserIds.every((userId) => doneUserIds.has(userId))) {
      continue;
    }
    const { data, error } = await supabase
      .from("announcements")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", batch.id)
      .eq("updated_at", batch.updatedAt)
      .is("email_sent_at", null)
      .select("id");
    if (error) {
      console.error(
        `[定期メール] お知らせの送信完了の記録に失敗しました: id=${batch.id}`,
        error.message
      );
      continue;
    }
    if ((data ?? []).length === 0) {
      console.warn(
        `[定期メール] 送信中にお知らせが編集された（または完了済み）ため、送信完了を記録しませんでした（翌日の実行で判定し直します）: id=${batch.id}`
      );
      continue;
    }
    completed++;
  }
  return completed;
}

function skip(reason: string): EmailDigestResult {
  console.warn(`[定期メール] ${reason}。送信をスキップしました`);
  return { status: "skipped", reason };
}
