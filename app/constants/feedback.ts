/** Master switch for learner feedback (#392). Fail-closed: only "true" enables. */
export function isFeedbackEnabled(): boolean {
  return process.env.FEEDBACK_ENABLED === "true";
}

export const FEEDBACK_DISABLED_MESSAGE = "フィードバック機能は現在利用できません";

export const FEEDBACK_CATEGORIES = ["bug", "improvement", "question", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "不具合報告",
  improvement: "改善要望",
  question: "質問",
  other: "その他",
};

export const FEEDBACK_STATUSES = ["open", "in_progress", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "完了",
};

/** Max body length accepted by POST /api/feedback. */
export const FEEDBACK_BODY_MAX_LENGTH = 2000;

/** Reject a second post within this window (DB count of recent rows for the user). */
export const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60_000;

/** Slack preview truncates the body to this many characters. */
export const FEEDBACK_SLACK_BODY_PREVIEW_CHARS = 200;
