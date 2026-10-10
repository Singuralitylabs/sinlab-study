import type { ContentType, SubmissionType } from "@/app/types";

/** Single source for allowed content types; validation, labels and options derive from it. */
export const CONTENT_TYPES: readonly ContentType[] = ["video", "text", "exercise", "slide", "quiz"];

/** Single source for allowed submission types; validation derives from it. */
export const SUBMISSION_TYPES: readonly SubmissionType[] = ["code", "url"];

/**
 * Submission methods an exercise accepts (learning_contents.allowed_submission_types). Unlike
 * SubmissionType (the type of the submission itself), it includes "both".
 */
export type AllowedSubmissionType = "code" | "url" | "both";
export const ALLOWED_SUBMISSION_TYPES: readonly AllowedSubmissionType[] = ["code", "url", "both"];

/**
 * Types the bulk set_type action may assign. A quiz needs its questions, which only the
 * create/edit form and the bulk create API send, so it is excluded.
 */
export const BULK_SETTABLE_CONTENT_TYPES: readonly ContentType[] = CONTENT_TYPES.filter(
  (type) => type !== "quiz"
);

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: "動画",
  text: "テキスト",
  exercise: "演習",
  slide: "スライド",
  quiz: "クイズ",
};

/** Max contents per bulk create request (POST /api/manage/contents/bulk). */
export const MAX_BULK_CREATE_CONTENTS = 50;

/** Max IDs per bulk API request; client-side chunked sending uses the same value. */
export const MAX_BULK_CONTENT_IDS = 100;

/**
 * Single source for allowed bulk actions, aligning what the client can send with what the API
 * accepts.
 */
export const BULK_CONTENT_ACTIONS = [
  "publish",
  "unpublish",
  "open_trial",
  "close_trial",
  "set_type",
  "delete",
] as const;
export type BulkContentAction = (typeof BULK_CONTENT_ACTIONS)[number];
