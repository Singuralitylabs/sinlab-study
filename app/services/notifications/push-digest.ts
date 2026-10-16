import {
  EMAIL_KIND,
  PUSH_DIGEST_TIME_BUDGET_MS,
  type PushKind,
} from "@/app/constants/notifications";
import { USER_STATUS } from "@/app/constants/user";
import { type DigestContent, type DigestUser, planMilestoneEmails } from "@/app/lib/email-digest";
import {
  applyPublishedNestedThemeFilters,
  type NestedThemeTree,
  orderContentsAcrossThemes,
} from "@/app/lib/published-theme-tree";
import { isAnnouncementPushCurrent, selectDigestPushTargets } from "@/app/lib/push-targets";
import { isWebPushConfigured } from "@/app/lib/web-push-config";
import { fetchEmailSettings } from "@/app/services/api/email-settings-server";
import type { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { isLearnerRole } from "@/app/services/auth/permissions";
import { sendPushToUser } from "@/app/services/notifications/push";
import type { UserRoleType, UserStatusType } from "@/app/types";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;

/**
 * Active and trial users, including people who opted out of email and people with no
 * deliverable address. Push consent is the subscription row, not `email_opt_out_at`.
 */
async function fetchPushAudience(supabase: AdminClient): Promise<DigestUser[]> {
  const rows: {
    id: number;
    email: string | null;
    display_name: string;
    status: string;
    membership_type: string | null;
    role: UserRoleType;
    created_at: string | null;
  }[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, display_name, status, membership_type, role, created_at")
      .eq("is_deleted", false)
      .in("status", [USER_STATUS.ACTIVE, USER_STATUS.TRIAL])
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      break;
    }
    rows.push(...data);
    offset += data.length;
  }

  return rows.flatMap((row) => {
    if (!row.created_at) {
      return [];
    }
    return [
      {
        userId: row.id,
        email: row.email ?? "",
        displayName: row.display_name,
        status: row.status as UserStatusType,
        membershipType: row.membership_type,
        role: row.role,
        createdAt: row.created_at,
      },
    ];
  });
}

async function fetchActiveUserIds(supabase: AdminClient, userIds: number[]): Promise<Set<number>> {
  const active = new Set<number>();
  if (userIds.length === 0) {
    return active;
  }
  // PostgREST stops at db-max-rows (1000). A truncated activity read would treat a learner who
  // already studied as inactive and send inactivity_reminder. Page until 0 rows, same as email.
  for (const table of ["user_progress", "submissions"] as const) {
    for (let index = 0; index < userIds.length; index += ID_CHUNK_SIZE) {
      const ids = userIds.slice(index, index + ID_CHUNK_SIZE);
      for (let offset = 0; ; ) {
        const { data, error } = await supabase
          .from(table)
          .select("user_id")
          .in("user_id", ids)
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          throw new Error(error.message);
        }
        if (!data || data.length === 0) {
          break;
        }
        for (const row of data) {
          active.add(row.user_id);
        }
        offset += data.length;
      }
    }
  }
  return active;
}

/** Same published-tree filter as the email digest, so the "first content" link cannot drift. */
async function fetchOrderedContents(supabase: AdminClient): Promise<DigestContent[]> {
  const { data, error } = await applyPublishedNestedThemeFilters(
    supabase
      .from("learning_themes")
      .select(
        "id, name, display_order, phases:learning_phases(id, name, display_order, weeks:learning_weeks(id, name, display_order, contents:learning_contents(id, title, display_order, is_open_to_trial, week_id)))"
      )
  ).order("display_order");
  if (error) {
    throw new Error(error.message);
  }
  type Row = {
    id: number;
    title: string;
    display_order: number | null;
    week_id: number;
    is_open_to_trial: boolean;
  };
  return orderContentsAcrossThemes((data ?? []) as NestedThemeTree<Row>[]).map(
    ({ themeId, themeName, content, raw }) => ({
      id: content.id,
      title: content.title,
      themeId,
      path: `/learn/${themeId}/${content.phaseId}/${content.weekId}/${content.id}`,
      themeName,
      isOpenToTrial: raw.is_open_to_trial === true,
    })
  );
}

type PushAnnouncementRow = {
  id: number;
  title: string;
  target_statuses: string[];
  target_membership_types: string[] | null;
  email_sent_at: string | null;
  push_sent_at: string | null;
};

async function fetchPushAnnouncements(
  supabase: AdminClient,
  sentSince: string
): Promise<
  {
    id: number;
    title: string;
    target_statuses: string[];
    target_membership_types: string[] | null;
    emailSentAt: string | null;
    pushSentAt: string | null;
  }[]
> {
  // Page until 0 rows. A single response stops at db-max-rows (1000) and would drop later
  // published_at values, so those announcements would never be pushed. The body is not selected.
  // Window is push_sent_at (not email_sent_at) so a crash after mail completion still retries.
  const rows: PushAnnouncementRow[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, target_statuses, target_membership_types, email_sent_at, push_sent_at")
      .not("published_at", "is", null)
      .eq("is_deleted", false)
      .eq("send_email", true)
      .or(`push_sent_at.is.null,push_sent_at.gte.${sentSince}`)
      .order("published_at")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      break;
    }
    rows.push(...(data as PushAnnouncementRow[]));
    offset += data.length;
  }
  return rows.flatMap((row) =>
    isAnnouncementPushCurrent(row.push_sent_at, sentSince)
      ? [
          {
            id: row.id,
            title: row.title,
            target_statuses: row.target_statuses,
            target_membership_types: row.target_membership_types,
            emailSentAt: row.email_sent_at,
            pushSentAt: row.push_sent_at,
          },
        ]
      : []
  );
}

async function markAnnouncementPushSent(
  supabase: AdminClient,
  announcementIds: number[]
): Promise<void> {
  if (announcementIds.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  for (let index = 0; index < announcementIds.length; index += ID_CHUNK_SIZE) {
    const ids = announcementIds.slice(index, index + ID_CHUNK_SIZE);
    // Only close after the email bulk send finished. Multi-day email keeps push_sent_at null so
    // newly eligible users still enter the queue; push_logs claim blocks duplicates.
    const { error } = await supabase
      .from("announcements")
      .update({ push_sent_at: now })
      .in("id", ids)
      .not("email_sent_at", "is", null);
    if (error) {
      console.error("[Web Push] push_sent_at の更新に失敗しました:", error.message);
    }
  }
}

/**
 * Sends the digest kinds whose `push_enabled` is on. Days and announcement targeting match the
 * email run; the email daily cap, the global mail switch, and `email_opt_out_at` do not apply.
 * Errors stay inside this function so `runEmailDigest()` can keep its own result.
 */
export async function deliverDigestPushes(
  supabase: AdminClient,
  today: string,
  announcementSentSince: string,
  clock: () => number = Date.now
): Promise<void> {
  if (!isWebPushConfigured()) {
    return;
  }
  const started = clock();
  const counts: Record<"sent" | "failed" | "duplicate" | "skipped", number> = {
    sent: 0,
    failed: 0,
    duplicate: 0,
    skipped: 0,
  };
  try {
    const settings = await fetchEmailSettings(supabase);
    const trial = settings.kinds.trial_nurture;
    const inactivity = settings.kinds.inactivity_reminder;
    const trialDays = trial.pushEnabled ? trial.sendDays : null;
    const inactivityDays = inactivity.pushEnabled ? inactivity.sendDays : null;
    const announcementOn = settings.kinds.announcement.pushEnabled;
    if (!trialDays && !inactivityDays && !announcementOn) {
      logDuration(clock() - started, counts);
      return;
    }

    const users = await fetchPushAudience(supabase);
    const preview = planMilestoneEmails(
      users.filter((user) => isLearnerRole(user.role)),
      today,
      { trialNurture: trialDays, inactivityReminder: inactivityDays }
    );
    const activeUserIds = await fetchActiveUserIds(
      supabase,
      preview.inactivityCandidates.map((item) => item.user.userId)
    );
    const contents = inactivityDays ? await fetchOrderedContents(supabase) : [];
    const announcements = announcementOn
      ? await fetchPushAnnouncements(supabase, announcementSentSince)
      : [];
    const targets = selectDigestPushTargets({
      users,
      today,
      trialDays,
      inactivityDays,
      activeUserIds,
      contents,
      announcements,
      announcementSentSince,
      finalTrialDay: Math.max(...(trial.sendDays ?? [0])),
    });

    // Do not stamp push_sent_at while any target still needs a retry (time cut-off or a failed
    // send that released its claim). Closing early would drop those users permanently.
    const unfinishedAnnouncementKeys = new Set<string>();
    for (let index = 0; index < targets.length; index++) {
      if (clock() - started >= PUSH_DIGEST_TIME_BUDGET_MS) {
        for (const remaining of targets.slice(index)) {
          if (remaining.kind === EMAIL_KIND.ANNOUNCEMENT) {
            unfinishedAnnouncementKeys.add(remaining.referenceKey);
          }
        }
        console.warn(
          `[Web Push] 定期配信の時間上限 ${PUSH_DIGEST_TIME_BUDGET_MS}ms に達したため打ち切りました`
        );
        break;
      }
      const target = targets[index];
      try {
        const result = await sendPushToUser(
          target.userId,
          target.kind,
          target.referenceKey,
          target.payload,
          supabase
        );
        counts[result] += 1;
        if (target.kind === EMAIL_KIND.ANNOUNCEMENT && result === "failed") {
          unfinishedAnnouncementKeys.add(target.referenceKey);
        }
      } catch (error) {
        counts.failed += 1;
        if (target.kind === EMAIL_KIND.ANNOUNCEMENT) {
          unfinishedAnnouncementKeys.add(target.referenceKey);
        }
        console.error(
          `[Web Push] 定期配信の1件が失敗しました: kind=${target.kind as PushKind}`,
          error instanceof Error ? error.message : "unknown"
        );
      }
    }

    const closable = announcements
      .filter((row) => row.emailSentAt !== null && !unfinishedAnnouncementKeys.has(String(row.id)))
      .map((row) => row.id);
    await markAnnouncementPushSent(supabase, closable);

    logDuration(clock() - started, counts);
  } catch (error) {
    console.error(
      "[Web Push] 定期配信でエラーが発生しました:",
      error instanceof Error ? error.message : "unknown"
    );
    logDuration(clock() - started, counts);
  }
}

function logDuration(
  elapsedMs: number,
  counts: Record<"sent" | "failed" | "duplicate" | "skipped", number>
): void {
  console.warn(
    `[Web Push] 定期配信 ${elapsedMs}ms sent=${counts.sent} failed=${counts.failed} duplicate=${counts.duplicate} skipped=${counts.skipped}`
  );
}
