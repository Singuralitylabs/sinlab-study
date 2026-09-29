import {
  EMAIL_DIGEST_MAX_PER_RUN,
  EMAIL_DIGEST_SEND_INTERVAL_MS,
  EMAIL_DIGEST_TIME_BUDGET_MS,
  EMAIL_KIND,
  PROMOTIONAL_EMAIL_KINDS,
  type PromotionalEmailKind,
  WEEKLY_DIGEST_RESERVATION_KIND,
} from "@/app/constants/notifications";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { buildThemeContentOrder, type NavigationWeek } from "@/app/lib/content-navigation";
import {
  addDays,
  type DigestContent,
  type DigestUser,
  isWeeklyDigestTarget,
  jstStartOfDayIso,
  lockedThemeNames,
  planMilestoneEmails,
  resolveNextContent,
  toJstDateString,
  visibleContentsFor,
  weekStartOf,
} from "@/app/lib/email-digest";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { type EmailContent, isEmailConfigured } from "@/app/services/notifications/email";
import {
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
import type { UserStatusType } from "@/app/types";

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

/** PostgREST の最大行数（既定 1000 行）を超えても取りこぼさないよう range でページングする */
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
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
    created_at: string | null;
  }>((from, to) =>
    supabase
      .from("users")
      .select("id, email, display_name, status, created_at")
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
    const phaseIdByWeekId = new Map<number, number>();
    for (const phase of theme.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        weeks.push({
          id: week.id,
          name: week.name,
          display_order: week.display_order,
          phase: { id: phase.id, name: phase.name, display_order: phase.display_order },
        });
        phaseIdByWeekId.set(week.id, phase.id);
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

/**
 * 月曜に週次進捗の対象になったユーザーを繰り越し予約として記録する（既にあれば何もしない）。
 * 失敗しても月曜の送信は続ける（その週の繰り越しが欠けるだけ）。
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
      console.error("[定期メール] 週次進捗の繰り越し予約に失敗しました:", error.message);
      return;
    }
  }
}

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
 * 送信キューを作る。今日（JST）が登録から N 日目のユーザーの `trial_nurture` /
 * `inactivity_reminder` を先に、`weekly_digest` を後に並べる（N 日目の案内は翌日に拾わないため、
 * 上限に掛かったときは繰り越せる週次進捗の方を後回しにする）。1人に同じ日に送る案内系メールは1通まで
 * （今日すでに案内系メールを claim したユーザーは、呼び出し元が `users` から除いておく）。
 */
async function buildQueue(
  supabase: AdminClient,
  users: DigestUser[],
  today: string,
  appUrl: string
): Promise<QueuedEmail[]> {
  if (users.length === 0) {
    return [];
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

  // 週次進捗（reference_key は週の開始日）。対象を決めるのは月曜だけで、月曜の対象者を繰り越し
  // 予約として記録する。火〜日曜は、予約を持ちまだ送っていないユーザー（月曜に上限・時間切れ・
  // 同日の別の案内で送れなかった分）だけに送り、週の途中で新しく対象になったユーザーには送らない。
  // 今週に入ってから登録したユーザーには「先週」が無いため送らない。
  const weekStart = weekStartOf(today);
  const isWeekStart = today === weekStart;
  let weeklyPool = users.filter((user) => toJstDateString(new Date(user.createdAt)) < weekStart);
  const poolIds = () => weeklyPool.map((user) => user.userId);
  if (!isWeekStart) {
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

  if (isWeekStart) {
    await reserveWeeklyDigest(
      supabase,
      weeklyItems.map((item) => item.user.userId),
      weekStart
    );
  }
  // 今日 N 日目の案内を送るユーザーには、週次進捗を翌日以降に回す（予約済みのため繰り越される）
  queue.push(...weeklyItems.filter((item) => !queuedUserIds.has(item.user.userId)));

  return queue;
}

/**
 * 今日送るべき定期メールをすべて判定して送る。
 *
 * - **二重送信の防止**: 1通ごとに `email_logs` へ `(user_id, kind, reference_key)` を claim してから
 *   送る（`deliverUserEmail()`）。同じ日の再実行・Cron の重複起動でも UNIQUE 違反で送らない
 * - **1人1日1通**: 今日すでに案内系メールを claim したユーザーは、同じ日の再実行で対象から外す
 *   （朝の実行後にステータスが変わっても、別種別の2通目を送らない）
 * - **1日の上限**: 今日すでに claim した案内系メールの数を `EMAIL_DIGEST_MAX_PER_RUN` から引いた数を
 *   今回の上限とし、処理した通数（成功・失敗・重複）が達するか、経過時間が
 *   `EMAIL_DIGEST_TIME_BUDGET_MS` を超えたら打ち切る。残りはログに残し、週次進捗は同じ週の
 *   翌日以降の実行で送る
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
  let queue: QueuedEmail[];
  let limit: number;
  try {
    supabase = await createAdminSupabaseClient();
    const todayLogs = await fetchTodayPromotionalLogs(supabase, today);
    const users = (await fetchDigestUsers(supabase)).filter(
      (user) => !todayLogs.userIds.has(user.userId)
    );
    queue = await buildQueue(supabase, users, today, appUrl);
    // 上限の件数はキューを作った後に数え直す。並行する別の実行が抽出中に claim した分は
    // キューから外れる（送信済みの判定で除かれる）ため、その分も上限から差し引かないと
    // 合計が上限を超える
    const claimedToday = (await fetchTodayPromotionalLogs(supabase, today)).count;
    limit = Math.max(0, EMAIL_DIGEST_MAX_PER_RUN - claimedToday);
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
    // 重複（他の実行が claim 済み）も数える。Cron の重複起動が並行しても、各実行は同じ順序の
    // キューの先頭 limit 件までしか扱わないため、合計の送信数は limit を超えない
    const processed = counts.sent + counts.failed + counts.duplicate;
    if (processed >= limit || clock() - startedAt >= EMAIL_DIGEST_TIME_BUDGET_MS) {
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

  const rest = queue.slice(index);
  if (rest.length > 0) {
    const carried = rest.filter((item) => item.carriesOver).length;
    console.warn(
      `[定期メール] 1日の上限（${EMAIL_DIGEST_MAX_PER_RUN}通）または実行時間の上限に達したため、${rest.length}通を送りませんでした（週次進捗 ${carried}通は同じ週の翌日以降に繰り越し、登録からN日目の案内 ${rest.length - carried}通は繰り越しません）`
    );
  }

  return {
    status: "completed",
    date: today,
    queued: queue.length,
    ...counts,
    deferred: rest.length,
  };
}

function skip(reason: string): EmailDigestResult {
  console.warn(`[定期メール] ${reason}。送信をスキップしました`);
  return { status: "skipped", reason };
}
