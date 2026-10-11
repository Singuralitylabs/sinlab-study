export interface WeeklyFunnelRow {
  weekStart: string;
  signups: number;
  activated: number;
  upgraded: number;
  ended: number;
  paidTotal: number;
}

export const WEEKLY_FUNNEL_FETCH_ERROR = "週次ファネルを取得できませんでした";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// Week length plus the 7-day cohort. A signup just before week_end stays open until then.
const ACTIVATION_COHORT_CLOSE_DAYS = 14;

/**
 * True while a signup at the end of this JST week can still submit within 7 days.
 * The previous week stays open for the whole current week; only the latest row is not enough.
 */
export function isActivationCohortOpen(weekStart: string, now: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(weekStart);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const closesAtUtc = Date.UTC(year, month - 1, day + ACTIVATION_COHORT_CLOSE_DAYS) - JST_OFFSET_MS;
  return now.getTime() < closesAtUtc;
}
