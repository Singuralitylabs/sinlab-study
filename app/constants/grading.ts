/**
 * Single source of the review labels: the types, point tables, zod schemas, the Gemini response
 * schema and the stored-row narrowing all derive from these, so adding a label can't be missed in
 * one place.
 */
export const REQUIREMENT_STATUSES = ["met", "partial", "unmet"] as const;
export const QUALITY_LEVELS = ["good", "fair", "poor"] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/** Points out of 100 contributed by requirement achievement and by code quality. */
export const REQUIREMENT_WEIGHT = 80;
export const QUALITY_WEIGHT = 20;

export const STATUS_POINTS: Record<RequirementStatus, number> = {
  met: 1,
  partial: 0.5,
  unmet: 0,
};

export const QUALITY_POINTS: Record<QualityLevel, number> = {
  good: 1,
  fair: 0.5,
  poor: 0,
};

/**
 * Minimum score for passing a rubric-graded review. 0 disables the score condition and the "no
 * unmet requirement" condition together, so `passed` stays NULL. Turn it on only in a PR that
 * changes this constant after reading the dry-run distribution (scripts/grading-dry-run.ts).
 */
export const CERTIFICATE_PASS_SCORE = 0;

export const GRADING_RUBRIC_MIN_REQUIREMENTS = 1;
export const GRADING_RUBRIC_MAX_REQUIREMENTS = 10;
export const GRADING_REQUIREMENT_NAME_MAX_LENGTH = 100;
export const GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH = 500;

/** Cap on exercise text sent to the AI when drafting a rubric. */
export const GRADING_RUBRIC_DRAFT_INPUT_MAX_LENGTH = 20_000;

/** Requirement count requested from the AI when drafting a rubric. */
export const GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS = 3;
export const GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS = 7;

export const REVIEW_MAX_SUGGESTIONS = 2;

export const SCORE_KINDS = ["rubric", "estimated", "none", "legacy", "incomplete"] as const;

export type ScoreKind = (typeof SCORE_KINDS)[number];

/** Estimated grading has no rubric to bound it, so cap what the AI may invent. */
export const ESTIMATED_MAX_REQUIREMENTS = GRADING_RUBRIC_MAX_REQUIREMENTS;
