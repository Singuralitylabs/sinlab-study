import type { ContentType, SubmissionType } from "@/app/types";

/** コンテンツ種別の許可値。バリデーション・ラベル表示・選択肢はこの1箇所から導出する */
export const CONTENT_TYPES: readonly ContentType[] = ["video", "text", "exercise", "slide"];

/** 提出種別（submissions.submission_type）の許可値。バリデーションはこの1箇所から導出する */
export const SUBMISSION_TYPES: readonly SubmissionType[] = ["code", "url"];

/**
 * 演習コンテンツが受け付ける提出方法（learning_contents.allowed_submission_types）。
 * 提出物そのものの種別（SubmissionType）とは異なり、両方許可する "both" を含む。
 */
export type AllowedSubmissionType = "code" | "url" | "both";
export const ALLOWED_SUBMISSION_TYPES: readonly AllowedSubmissionType[] = ["code", "url", "both"];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: "動画",
  text: "テキスト",
  exercise: "演習",
  slide: "スライド",
};

/** 一括操作APIへ一度に送るIDの上限。クライアント側の分割送信もこの値でチャンク化する */
export const MAX_BULK_CONTENT_IDS = 100;

/** 一括操作APIの許可action。クライアントの送信可能アクションとAPIの受理範囲をこの1箇所から揃える */
export const BULK_CONTENT_ACTIONS = [
  "publish",
  "unpublish",
  "open_trial",
  "close_trial",
  "set_type",
  "delete",
] as const;
export type BulkContentAction = (typeof BULK_CONTENT_ACTIONS)[number];
