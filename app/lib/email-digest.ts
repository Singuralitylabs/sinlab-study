import {
  INACTIVITY_REMINDER_DAYS,
  TRIAL_NURTURE_DAYS,
  type TrialNurtureDay,
} from "@/app/constants/notifications";
import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";

/**
 * 定期メール（`GET /api/cron/email-digest`）の送信対象の判定。DB・送信に依存しない純粋関数だけを
 * 置き、日付はすべて日本時間（JST）の暦日（`YYYY-MM-DD`）で扱う。日本は夏時間が無いため、
 * UTC に 9 時間足した日付を JST の暦日とみなせる。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日時を JST の暦日（`YYYY-MM-DD`）にする */
export function toJstDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 暦日（`YYYY-MM-DD`）の UTC 0 時のエポックミリ秒（暦日同士の差・曜日の計算用） */
function dateStringToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** 暦日に n 日足す（負数で引く） */
export function addDays(date: string, days: number): string {
  return new Date(dateStringToUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 暦日の差（to - from、日数） */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateStringToUtcMs(to) - dateStringToUtcMs(from)) / DAY_MS);
}

/** その暦日を含む週の月曜日（週次進捗の reference_key。週は月曜始まり） */
export function weekStartOf(date: string): string {
  const dayOfWeek = new Date(dateStringToUtcMs(date)).getUTCDay(); // 0 = 日曜
  return addDays(date, -((dayOfWeek + 6) % 7));
}

/** JST の暦日の 0:00 を ISO 文字列（UTC）にする（DB の timestamptz との範囲比較用） */
export function jstStartOfDayIso(date: string): string {
  return new Date(dateStringToUtcMs(date) - JST_OFFSET_MS).toISOString();
}

/**
 * 登録から何日目か。`users.created_at` を JST の暦日に丸め、登録日を 0 日目とする
 * （例: 10/1 23:30 JST に登録したユーザーは 10/8 が 7 日目）。
 */
export function daysSinceSignup(createdAt: string, today: string): number {
  return daysBetween(toJstDateString(new Date(createdAt)), today);
}

/**
 * 週次進捗の対象になれる登録日か。「先週」（前週の月曜〜日曜）をまるごと利用できたユーザー、
 * つまり前週の月曜以前（JST）に登録したユーザーだけを対象にする。先週の途中に登録した
 * ユーザーへ「先週は学習の記録がありませんでした」と送らないため。
 */
export function coversPreviousWeek(createdAt: string, weekStart: string): boolean {
  return daysSinceSignup(createdAt, weekStart) >= 7;
}

/** 定期メールの送信候補（`member` かつ `active` / `trial`、配信停止していないユーザー） */
export type DigestUser = {
  userId: number;
  email: string;
  displayName: string;
  status: UserStatusType;
  /** 会員種別（お知らせの対象判定に使う）。お試しユーザーは null */
  membershipType: string | null;
  createdAt: string;
};

export type MilestoneEmail<Day extends number> = { user: DigestUser; day: Day };

/**
 * 「登録から N 日目」に送る2種の対象を決める。
 *
 * - `trial_nurture`: `status = trial` で、今日が 2・5・7・14 日目のユーザー
 * - `inactivity_reminder`: 今日が 7・14 日目のユーザー（学習の有無は呼び出し元が
 *   `user_progress` / `submissions` で確かめる）。同じ日に `trial_nurture` を送るユーザーは除く
 *
 * 日次実行が失敗・上限超過で送れなかった日の分は、翌日以降に拾わない（N 日目ちょうどだけ判定する）。
 */
export function planMilestoneEmails(
  users: DigestUser[],
  today: string
): {
  trialNurture: MilestoneEmail<TrialNurtureDay>[];
  inactivityCandidates: MilestoneEmail<number>[];
} {
  const trialNurture: MilestoneEmail<TrialNurtureDay>[] = [];
  const inactivityCandidates: MilestoneEmail<number>[] = [];

  for (const user of users) {
    const day = daysSinceSignup(user.createdAt, today);
    const nurtureDay = TRIAL_NURTURE_DAYS.find((d) => d === day);
    if (user.status === USER_STATUS.TRIAL && nurtureDay !== undefined) {
      trialNurture.push({ user, day: nurtureDay });
      continue;
    }
    if ((INACTIVITY_REMINDER_DAYS as readonly number[]).includes(day)) {
      inactivityCandidates.push({ user, day });
    }
  }

  return { trialNurture, inactivityCandidates };
}

/** 学習順に並べた配信中のコンテンツ（テーマ→フェーズ→週→コンテンツの表示順） */
export type DigestContent = {
  id: number;
  title: string;
  /** コンテンツ詳細のアプリ内パス（`/learn/<theme>/<phase>/<week>/<content>`） */
  path: string;
  themeName: string;
  isOpenToTrial: boolean;
};

/** そのユーザーが閲覧できるコンテンツ（お試しユーザーはお試し公開のみ）を学習順のまま返す */
export function visibleContentsFor(
  contents: DigestContent[],
  status: UserStatusType
): DigestContent[] {
  return status === USER_STATUS.TRIAL ? contents.filter((c) => c.isOpenToTrial) : contents;
}

/** 次に学ぶコンテンツ（閲覧できる未完了の先頭）と未完了の数 */
export function resolveNextContent(
  visibleContents: DigestContent[],
  completedContentIds: ReadonlySet<number>
): { next: DigestContent | null; remaining: number } {
  const incomplete = visibleContents.filter((c) => !completedContentIds.has(c.id));
  return { next: incomplete[0] ?? null, remaining: incomplete.length };
}

/**
 * 週次進捗（`weekly_digest`）を送るか。直近1週間に完了または提出が1件以上ある、
 * または閲覧できる未完了コンテンツが残っているユーザーに送る。
 */
export function isWeeklyDigestTarget(params: {
  completedLastWeek: number;
  submittedLastWeek: number;
  remainingContents: number;
}): boolean {
  return (
    params.completedLastWeek > 0 || params.submittedLastWeek > 0 || params.remainingContents > 0
  );
}

/** お試しユーザーには鍵が掛かるコンテンツを含むテーマ名（学習順・重複なし） */
export function lockedThemeNames(contents: DigestContent[]): string[] {
  return [...new Set(contents.filter((c) => !c.isOpenToTrial).map((c) => c.themeName))];
}
