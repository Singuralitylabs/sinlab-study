export interface WeeklyFunnelRow {
  weekStart: string;
  signups: number;
  activated: number;
  upgraded: number;
  ended: number;
  paidTotal: number;
}

export const WEEKLY_FUNNEL_FETCH_ERROR = "週次ファネルを取得できませんでした";
