import {
  EMAIL_DIGEST_LOCK_NAME,
  EMAIL_DIGEST_LOCK_TTL_MS,
  EMAIL_DIGEST_MAX_PER_DAY,
  EMAIL_DIGEST_SEND_INTERVAL_MS,
  EMAIL_DIGEST_TIME_BUDGET_MS,
  EMAIL_KIND,
  PROMOTIONAL_EMAIL_KINDS,
  type PromotionalEmailKind,
  WEEKLY_DIGEST_CATCH_UP_DAYS,
  WEEKLY_DIGEST_RESERVATION_KIND,
} from "@/app/constants/notifications";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { isAnnouncementTarget } from "@/app/lib/announcement-target";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { buildThemeContentOrder, type NavigationWeek } from "@/app/lib/content-navigation";
import {
  addDays,
  coversPreviousWeek,
  type DigestContent,
  type DigestUser,
  daysBetween,
  isWeeklyDigestTarget,
  jstStartOfDayIso,
  lockedThemeNames,
  planMilestoneEmails,
  resolveNextContent,
  toJstDateString,
  visibleContentsFor,
  weekStartOf,
} from "@/app/lib/email-digest";
import { type CronLock, claimCronLock, releaseCronLock } from "@/app/services/api/cron-lock-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
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
import {
  type AdminClient,
  type DeliverResult,
  deliverUserEmail,
} from "@/app/services/notifications/user-emails";
import type { Announcement, UserStatusType } from "@/app/types";

/**
 * 定期メール（週次進捗・未学習リマインド・お試しユーザー向け案内）の対象抽出と送信。
 * `GET /api/cron/email-digest`（Vercel Cron、毎日 JST 8 時台）から呼ぶ。
 *
 * ユーザーセッションの無いバッチのため、抽出は service_role クライアントで行う（`user_id` 単位の
 * 集計であり、受講生へコンテンツを返す配信経路ではない）。学習コンテンツの読み取りは
 * `is_published = true AND is_deleted = false` を全階層で絞り、本文を含まないカラムだけを select する。
 */

const PAGE_SIZE = 1000;
/** `.in("user_id", ...)` に一度に渡す ID 数（クエリ文字列の長さを抑える） */
const ID_CHUNK_SIZE = 100;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/**
 * PostgREST の最大行数（`db-max-rows`）を超えても取りこぼさないよう range でページングする。
 * サーバーの最大行数が `PAGE_SIZE` より小さく設定されていても欠落しないよう、次の位置は
 * 実際に返った件数だけ進め、0件が返るまで取りに行く（「PAGE_SIZE 未満なら最後」とは判定しない）。
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

/** 送信候補: 受講生（member）の active / trial で、配信停止していないユーザー */
async function fetchDigestUsers(supabase: AdminClient): Promise<DigestUser[]> {
  const rows = await fetchAllPages<{
    id: number;
    email: string;
    display_name: string;
    status: string;
    membership_type: string | null;
    created_at: string | null;
  }>((from, to) =>
    supabase
      .from("users")
      .select("id, email, display_name, status, membership_type, created_at")
      .eq("is_deleted", false)
      .eq("role", USER_ROLE.MEMBER)
      .in("status", [USER_STATUS.ACTIVE, USER_STATUS.TRIAL])
      .is("email_opt_out_at", null)
      .order("id")
      .range(from, to)
  );

  return rows
    .filter((row) => row.email && row.created_at)
    .map((row) => ({
      userId: row.id,
      email: row.email,
      displayName: row.display_name,
      status: row.status as UserStatusType,
      membershipType: row.membership_type ?? null,
      createdAt: row.created_at as string,
    }));
}

type ContentRow = {
  id: number;
  title: string;
  display_order: number | null;
  is_open_to_trial: boolean;
  week_id: number;
};
type ThemeRow = {
  id: number;
  name: string;
  display_order: number | null;
  phases: {
    id: number;
    name: string;
    display_order: number | null;
    weeks: {
      id: number;
      name: string;
      display_order: number | null;
      contents: ContentRow[];
    }[];
  }[];
};

/**
 * 配信中のコンテンツを学習順（テーマ→フェーズ→週→コンテンツの表示順）に並べて返す。
 * ネスト select と全階層の公開・未削除の絞り込みは `fetchThemeProgressSummaries()` と同じ形で、
 * 並び順はコンテンツ詳細の前後ナビと同じ `buildThemeContentOrder()` に委ねる。
 */
async function fetchOrderedContents(supabase: AdminClient): Promise<DigestContent[]> {
  const { data, error } = await supabase
    .from("learning_themes")
    .select(
      "id, name, display_order, phases:learning_phases(id, name, display_order, weeks:learning_weeks(id, name, display_order, contents:learning_contents(id, title, display_order, is_open_to_trial, week_id)))"
    )
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("phases.is_published", true)
    .eq("phases.is_deleted", false)
    .eq("phases.weeks.is_published", true)
    .eq("phases.weeks.is_deleted", false)
    .eq("phases.weeks.contents.is_published", true)
    .eq("phases.weeks.contents.is_deleted", false)
    .order("display_order");

  if (error) {
    throw new Error(error.message);
  }

  const themes = [...((data ?? []) as ThemeRow[])].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );

  return themes.flatMap((theme) => {
    const weeks: NavigationWeek[] = [];
    const contents: ContentRow[] = [];
    for (const phase of theme.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        weeks.push({
          id: week.id,
          name: week.name,
          display_order: week.display_order,
          phase: { id: phase.id, name: phase.name, display_order: phase.display_order },
        });
        contents.push(...(week.contents ?? []));
      }
    }
    const openToTrial = new Map(contents.map((c) => [c.id, c.is_open_to_trial]));

    return buildThemeContentOrder(weeks, contents).map((content) => ({
      id: content.id,
      title: content.title,
      path: `/learn/${theme.id}/${content.phaseId}/${content.weekId}/${content.id}`,
      themeName: theme.name,
      isOpenToTrial: openToTrial.get(content.id) === true,
    }));
  });
}

/** 学習の記録（進捗行・提出）が1件でもあるユーザーの ID */
async function fetchUserIdsWithActivity(
  supabase: AdminClient,
  userIds: number[]
): Promise<Set<number>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const [progress, submissions] = await Promise.all(
    (["user_progress", "submissions"] as const).map((table) =>
      fetchForUserIds<{ user_id: number }>(userIds, (ids, from, to) =>
        supabase.from(table).select("user_id").in("user_id", ids).order("id").range(from, to)
      )
    )
  );
  return new Set([...progress, ...submissions].map((row) => row.user_id));
}

/**
 * `email_logs` に (kind, reference_key) の行を持つユーザーの ID。今週の週次進捗を送信済み
 * （または送信中・送信失敗）のユーザーと、今週の繰り越し予約を持つユーザーの判定に使う
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

type WeeklyStats = {
  completedIdsByUser: Map<number, Set<number>>;
  completedLastWeekByUser: Map<number, number>;
  submittedLastWeekByUser: Map<number, number>;
};

/**
 * 週次進捗の集計。完了済みコンテンツ（次に学ぶコンテンツの判定用）と、先週
 * （[lastWeekStart, weekStart) の JST 暦日）の完了数・提出数をユーザー単位で数える。
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
 * 今日（JST 0:00 以降）に claim された案内系メールの送信ログ。1日の上限と「1人1日1通」を
 * 実行をまたいで守るために使う（同じ日の再実行・Cron の重複起動・手動 curl を含む）。
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

/** 今週の繰り越し予約が1件でもあるか（月曜の実行が対象決定まで到達したか） */
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
 * 月曜に週次進捗の対象になったユーザーを繰り越し予約として記録する（既にあれば何もしない）。
 * 予約は送信の前提とし、失敗したら throw する（呼び出し元は1通も送らずに失敗を返す）。
 * claim の前なので、再実行しても二重送信にはならず、予約からやり直せる。
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
  "id" | "title" | "body" | "target_statuses" | "target_membership_types"
>;

/**
 * メールの一斉送信を待っているお知らせ（公開済み・未削除・`send_email`・まだ全員に送り終えて
 * いない）。公開の古い順
 */
async function fetchPendingAnnouncements(supabase: AdminClient): Promise<PendingAnnouncement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, target_statuses, target_membership_types")
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

/** お知らせごとの、`email_logs` に行を持つ（送信済み・送信中・送信失敗の）ユーザーの ID */
async function fetchAnnouncementLoggedUserIds(
  supabase: AdminClient,
  referenceKeys: string[]
): Promise<Map<string, Set<number>>> {
  const rows = await fetchAllPages<{ user_id: number; reference_key: string }>((from, to) =>
    supabase
      .from("email_logs")
      .select("user_id, reference_key")
      .eq("kind", EMAIL_KIND.ANNOUNCEMENT)
      .in("reference_key", referenceKeys)
      .order("id")
      .range(from, to)
  );
  const logged = new Map<string, Set<number>>();
  for (const row of rows) {
    const ids = logged.get(row.reference_key) ?? new Set<number>();
    ids.add(row.user_id);
    logged.set(row.reference_key, ids);
  }
  return logged;
}

/** 一斉送信の進み具合。今回の実行で全員を処理し終えたら `email_sent_at` を記録する */
type AnnouncementBatch = {
  id: number;
  referenceKey: string;
  /** 対象者のうち、今回の実行の開始時点でまだ `email_logs` に行が無いユーザー */
  pendingUserIds: number[];
};

/** 送信キューの1通。本文は送る直前に組み立てる */
type QueuedEmail = {
  kind: PromotionalEmailKind;
  referenceKey: string;
  user: DigestUser;
  build: (unsubscribeUrl: string) => EmailContent;
  /** 上限・時間切れで送れなかったとき、同じ週の翌日以降の実行に繰り越されるか */
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
      /** 上限・時間切れで今回送らなかった通数（うち週次進捗は翌日以降に繰り越す） */
      deferred: number;
      /**
       * 今週の週次進捗の予約が無く、取り戻し期間も過ぎたため週次進捗を送らなかった
       * （月曜・火曜の実行が完了しなかった）
       */
      weeklyReservationMissing: boolean;
      /** この実行で対象者全員に送り終えた（`email_sent_at` を記録した）お知らせの件数 */
      announcementsCompleted: number;
    };

export type EmailDigestOptions = {
  now?: Date;
  /** 経過時間の計測（テスト用に差し替え可能） */
  clock?: () => number;
  /** 送信間隔の待機（テスト用に差し替え可能） */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * お知らせのメール一斉送信を送信キューに加える（kind = `announcement`、reference_key =
 * お知らせの ID）。対象は配信停止していない受講生のうち、ステータス・会員種別がお知らせの
 * 対象に一致するユーザー（`isAnnouncementTarget()`。アプリ内表示と同じ条件）。
 *
 * 全員を1回で送り切れない（1日の上限・実行時間・1人1日1通）ときは、`email_logs` に行が
 * 無いユーザーを翌日以降の実行で送る（分割送信）。今日すでに案内系メールを受け取った
 * ユーザー（`sendableUserIds` に無い）と、この実行で別の案内を送るユーザーは翌日に回す。
 * 完了の判定に使うため、対象者（`allUsers` から抽出）のうち未送信の全員を返す。
 */
async function appendAnnouncementEmails(
  supabase: AdminClient,
  allUsers: DigestUser[],
  sendableUserIds: ReadonlySet<number>,
  queuedUserIds: Set<number>,
  queue: QueuedEmail[],
  appUrl: string
): Promise<AnnouncementBatch[]> {
  const announcements = await fetchPendingAnnouncements(supabase);
  if (announcements.length === 0) {
    return [];
  }
  const logged = await fetchAnnouncementLoggedUserIds(
    supabase,
    announcements.map((announcement) => String(announcement.id))
  );

  return announcements.map((announcement) => {
    const referenceKey = String(announcement.id);
    const done = logged.get(referenceKey) ?? new Set<number>();
    const pending = allUsers.filter(
      (user) =>
        !done.has(user.userId) &&
        isAnnouncementTarget(announcement, {
          status: user.status,
          membershipType: user.membershipType,
        })
    );

    for (const user of pending) {
      if (!sendableUserIds.has(user.userId) || queuedUserIds.has(user.userId)) {
        continue;
      }
      queue.push({
        kind: EMAIL_KIND.ANNOUNCEMENT,
        referenceKey,
        user,
        carriesOver: true,
        build: (unsubscribeUrl) =>
          buildAnnouncementEmail({
            displayName: user.displayName,
            appUrl,
            unsubscribeUrl,
            announcementId: announcement.id,
            title: announcement.title,
            body: announcement.body,
          }),
      });
      queuedUserIds.add(user.userId);
    }

    return { id: announcement.id, referenceKey, pendingUserIds: pending.map((u) => u.userId) };
  });
}

/**
 * 送信キューを作る。今日（JST）が登録から N 日目のユーザーの `trial_nurture` /
 * `inactivity_reminder` を先に、お知らせの一斉送信を次に、`weekly_digest` を最後に並べる
 * （N 日目の案内は翌日に拾わないため、上限に掛かったときは繰り越せるお知らせ・週次進捗の方を
 * 後回しにする）。1人に同じ日に送る案内系メールは1通まで（今日すでに案内系メールを claim した
 * ユーザー `excludedToday` には送らない）。
 */
async function buildQueue(
  supabase: AdminClient,
  allUsers: DigestUser[],
  excludedToday: ReadonlySet<number>,
  today: string,
  appUrl: string
): Promise<{
  queue: QueuedEmail[];
  weeklyReservationMissing: boolean;
  announcementBatches: AnnouncementBatch[];
}> {
  const users = allUsers.filter((user) => !excludedToday.has(user.userId));
  if (users.length === 0) {
    // 送れる人がいなくても、対象者のいないお知らせを完了にできるよう一斉送信の状況は返す
    const announcementBatches = await appendAnnouncementEmails(
      supabase,
      allUsers,
      new Set(),
      new Set(),
      [],
      appUrl
    );
    return { queue: [], weeklyReservationMissing: false, announcementBatches };
  }

  const contents = await fetchOrderedContents(supabase);
  const upgradeAvailable = isStripeEnabled();
  const queue: QueuedEmail[] = [];
  const queuedUserIds = new Set<number>();

  const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today);
  for (const { user, day } of trialNurture) {
    queue.push({
      kind: EMAIL_KIND.TRIAL_NURTURE,
      referenceKey: `day${day}`,
      user,
      carriesOver: false,
      build: (unsubscribeUrl) =>
        buildTrialNurtureEmail({
          displayName: user.displayName,
          appUrl,
          unsubscribeUrl,
          day,
          upgradeAvailable,
          lockedThemeNames: lockedThemeNames(contents),
        }),
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
        buildInactivityReminderEmail({
          displayName: user.displayName,
          appUrl,
          unsubscribeUrl,
          firstContent: first ? { title: first.title, path: first.path } : null,
        }),
    });
    queuedUserIds.add(user.userId);
  }

  const announcementBatches = await appendAnnouncementEmails(
    supabase,
    allUsers,
    new Set(users.map((user) => user.userId)),
    queuedUserIds,
    queue,
    appUrl
  );

  // 週次進捗（reference_key は週の開始日）。対象を決めるのは月曜だけで、月曜の対象者を繰り越し
  // 予約として記録する。火〜日曜は、予約を持ちまだ送っていないユーザー（月曜に上限・時間切れ・
  // 同日の別の案内で送れなかった分）だけに送り、週の途中で新しく対象になったユーザーには送らない。
  // ただし今週の予約が1件も無い（月曜の実行が対象決定まで到達しなかった）ときは、
  // `WEEKLY_DIGEST_CATCH_UP_DAYS`（火曜）までの実行が月曜の代わりに対象を決める。
  // 先週の途中以降に登録したユーザーには、まるごとの「先週」が無いため送らない。
  const weekStart = weekStartOf(today);
  const daysSinceWeekStart = daysBetween(weekStart, today);
  let decidesTargets = daysSinceWeekStart === 0;
  let weeklyReservationMissing = false;
  if (!decidesTargets && !(await hasWeeklyDigestReservation(supabase, weekStart))) {
    // 月曜の実行が対象決定まで到達しなかった（失敗・スキップ・起動漏れ）。火曜までは月曜の
    // 代わりに対象を決め、それより後は送らずに気づけるようにする
    if (daysSinceWeekStart <= WEEKLY_DIGEST_CATCH_UP_DAYS) {
      decidesTargets = true;
      console.warn(
        `[定期メール] 今週（${weekStart}）の週次進捗の予約が無いため、今日の実行で対象を決めて送ります`
      );
    } else {
      weeklyReservationMissing = true;
      console.warn(
        `[定期メール] 今週（${weekStart}）の週次進捗の予約が無いため、週次進捗は送りません（月曜・火曜の実行が完了しなかった可能性があります）`
      );
    }
  }
  let weeklyPool = users.filter((user) => coversPreviousWeek(user.createdAt, weekStart));
  const poolIds = () => weeklyPool.map((user) => user.userId);
  if (weeklyReservationMissing) {
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
  const logged = await fetchLoggedUserIds(supabase, poolIds(), EMAIL_KIND.WEEKLY_DIGEST, weekStart);
  const weeklyUsers = weeklyPool.filter((user) => !logged.has(user.userId));
  const stats = await fetchWeeklyStats(
    supabase,
    weeklyUsers.map((user) => user.userId),
    weekStart
  );

  const weeklyItems: QueuedEmail[] = [];
  for (const user of weeklyUsers) {
    const completedLastWeek = stats.completedLastWeekByUser.get(user.userId) ?? 0;
    const submittedLastWeek = stats.submittedLastWeekByUser.get(user.userId) ?? 0;
    const { next, remaining } = resolveNextContent(
      visibleContentsFor(contents, user.status),
      stats.completedIdsByUser.get(user.userId) ?? new Set()
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
      carriesOver: true,
      build: (unsubscribeUrl) =>
        buildWeeklyDigestEmail({
          displayName: user.displayName,
          appUrl,
          unsubscribeUrl,
          completedLastWeek,
          submittedLastWeek,
          nextContent: next ? { title: next.title, path: next.path } : null,
          remainingContents: remaining,
        }),
    });
  }

  if (decidesTargets) {
    await reserveWeeklyDigest(
      supabase,
      weeklyItems.map((item) => item.user.userId),
      weekStart
    );
  }
  // 今日 N 日目の案内を送るユーザーには、週次進捗を翌日以降に回す（予約済みのため繰り越される）
  queue.push(...weeklyItems.filter((item) => !queuedUserIds.has(item.user.userId)));

  return { queue, weeklyReservationMissing, announcementBatches };
}

/**
 * 今日送るべき定期メールをすべて判定して送る。
 *
 * - **並行実行の排除**: 実行ロック（`cron_locks`、`claimCronLock()`）を取れた実行だけが処理する。
 *   Cron の重複起動・手動実行が重なっても、後から来た実行は何もせずに `skipped` を返す
 * - **二重送信の防止**: 1通ごとに `email_logs` へ `(user_id, kind, reference_key)` を claim してから
 *   送る（`deliverUserEmail()`）。同じ日の再実行でも UNIQUE 違反で送らない
 * - **1人1日1通**: 今日すでに案内系メールを claim したユーザーは、同じ日の再実行で対象から外す
 *   （朝の実行後にステータスが変わっても、別種別の2通目を送らない）
 * - **1日の上限**: 今日すでに claim した案内系メールの数を `EMAIL_DIGEST_MAX_PER_DAY` から引いた数を
 *   今回の上限とし、送信を試みた通数が達するか、経過時間が `EMAIL_DIGEST_TIME_BUDGET_MS` を
 *   超えたら打ち切る。残りはログに残し、週次進捗は同じ週の翌日以降の実行で送る
 * - **配信停止**: 抽出の段階で `email_opt_out_at IS NULL` に絞り、全通のフッターに配信停止リンクを入れる
 *
 * 送信設定（`RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `NEXT_PUBLIC_APP_URL`）か
 * `EMAIL_UNSUBSCRIBE_SECRET` が無い環境では何もしない（配信停止リンクを作れない案内メールは送らない）。
 */
export async function runEmailDigest(options: EmailDigestOptions = {}): Promise<EmailDigestResult> {
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = clock();

  if (!isEmailConfigured()) {
    return skip("RESEND_API_KEY または EMAIL_FROM_ADDRESS が未設定です");
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return skip("NEXT_PUBLIC_APP_URL が未設定です");
  }
  if (!isUnsubscribeConfigured()) {
    return skip("EMAIL_UNSUBSCRIBE_SECRET が未設定です");
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

  try {
    return await sendDigest(supabase, today, appUrl, { clock, sleep, startedAt });
  } finally {
    await releaseCronLock(supabase, lock);
  }
}

/** 実行ロックを取った実行だけが呼ぶ、抽出から送信までの本体 */
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
  try {
    const todayLogs = await fetchTodayPromotionalLogs(supabase, today);
    limit = Math.max(0, EMAIL_DIGEST_MAX_PER_DAY - todayLogs.count);
    ({ queue, weeklyReservationMissing, announcementBatches } = await buildQueue(
      supabase,
      await fetchDigestUsers(supabase),
      todayLogs.userIds,
      today,
      appUrl
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

  const announcementsCompleted = await markCompletedAnnouncements(supabase, announcementBatches);

  const rest = queue.slice(index);
  if (rest.length > 0) {
    const carried = rest.filter((item) => item.carriesOver).length;
    console.warn(
      `[定期メール] 1日の上限（${EMAIL_DIGEST_MAX_PER_DAY}通）または実行時間の上限に達したため、${rest.length}通を送りませんでした（お知らせ・週次進捗 ${carried}通は翌日以降に繰り越し、登録からN日目の案内 ${rest.length - carried}通は繰り越しません）`
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
 * 実行の開始時点で未送信だった対象者全員の `email_logs` の行（送信済み・送信失敗・送信中）が
 * そろったお知らせに `email_sent_at` を記録する（一斉送信の完了）。判定は送信ループの結果では
 * なく `email_logs` を引き直して行うため、claim 自体が DB エラーで失敗した宛先や、例外で
 * 送れなかった宛先（行が作られない）が残っていれば完了にしない。今日すでに別の案内を
 * 受け取った・上限や時間切れで回らなかった対象者も同様に残り、翌日以降の実行が続きを送る。
 * 対象者がいないお知らせもここで完了にする。引き直し・記録の失敗はログだけ残す
 * （翌日の実行で判定し直せる）。
 */
async function markCompletedAnnouncements(
  supabase: AdminClient,
  batches: AnnouncementBatch[]
): Promise<number> {
  if (batches.length === 0) {
    return 0;
  }
  let logged: Map<string, Set<number>>;
  try {
    logged = await fetchAnnouncementLoggedUserIds(
      supabase,
      batches.map((batch) => batch.referenceKey)
    );
  } catch (error) {
    console.error(
      "[定期メール] お知らせの送信状況の確認に失敗しました:",
      error instanceof Error ? error.message : error
    );
    return 0;
  }

  let completed = 0;
  for (const batch of batches) {
    const done = logged.get(batch.referenceKey) ?? new Set<number>();
    if (!batch.pendingUserIds.every((userId) => done.has(userId))) {
      continue;
    }
    const { error } = await supabase
      .from("announcements")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", batch.id)
      .is("email_sent_at", null);
    if (error) {
      console.error(
        `[定期メール] お知らせの送信完了の記録に失敗しました: id=${batch.id}`,
        error.message
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
