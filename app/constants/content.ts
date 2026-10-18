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

/**
 * Learner-facing label. Slides are presented as explanatory articles too, so learners see three
 * categories (video / article / exercise) plus quiz; the admin labels above keep the real types.
 */
export const CONTENT_TYPE_LEARNER_LABELS: Record<ContentType, string> = {
  video: "解説動画",
  text: "解説記事",
  slide: "解説記事",
  exercise: "演習",
  quiz: "クイズ",
};

/**
 * Illustrated thumbnails for the learner cards (640x360 WebP in public/images/content-types).
 * Partial on purpose: types without a picture (quiz) fall back to the drawn illustration. Slides
 * share the article picture because learners see them as articles.
 */
export const CONTENT_TYPE_THUMBNAILS: Partial<Record<ContentType, string>> = {
  video: "/images/content-types/video.webp",
  text: "/images/content-types/text.webp",
  exercise: "/images/content-types/exercise.webp",
  slide: "/images/content-types/text.webp",
};

/**
 * Accent per content type for the learner content rows. Green is reserved for "completed"
 * (border-success), so no type uses it; keyed by ContentType so a new type fails to compile until
 * it has a color.
 */
export const CONTENT_TYPE_ACCENT_CLASSES: Record<ContentType, string> = {
  video: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  text: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  exercise: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  slide: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  quiz: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
};

/** Card frame per type for the phase page grid; same hues as the accent classes. */
export const CONTENT_TYPE_BORDER_CLASSES: Record<ContentType, string> = {
  video: "border-rose-400 dark:border-rose-500/70",
  text: "border-sky-400 dark:border-sky-500/70",
  exercise: "border-amber-400 dark:border-amber-500/70",
  slide: "border-sky-400 dark:border-sky-500/70",
  quiz: "border-teal-400 dark:border-teal-500/70",
};

/** Large category label color on the phase page cards. */
export const CONTENT_TYPE_LABEL_CLASSES: Record<ContentType, string> = {
  video: "text-rose-600 dark:text-rose-400",
  text: "text-sky-600 dark:text-sky-400",
  exercise: "text-amber-700 dark:text-amber-400",
  slide: "text-sky-600 dark:text-sky-400",
  quiz: "text-teal-700 dark:text-teal-400",
};

/** Labels for the admin type pickers, which name the slide format explicitly. */
export const CONTENT_TYPE_FORM_LABELS: Record<ContentType, string> = {
  ...CONTENT_TYPE_LABELS,
  slide: "スライド（PDF）",
};

export const CONTENT_TYPE_FORM_OPTIONS: { value: ContentType; label: string }[] = CONTENT_TYPES.map(
  (value) => ({ value, label: CONTENT_TYPE_FORM_LABELS[value] })
);

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
