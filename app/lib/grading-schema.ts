import { z } from "zod";
import {
  ESTIMATED_MAX_REQUIREMENTS,
  GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH,
  GRADING_REQUIREMENT_NAME_MAX_LENGTH,
  GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS,
  GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS,
  GRADING_RUBRIC_MAX_REQUIREMENTS,
  GRADING_RUBRIC_MIN_REQUIREMENTS,
  QUALITY_LEVELS,
  REQUIREMENT_STATUSES,
  REVIEW_MAX_SUGGESTIONS,
} from "@/app/constants/grading";
import type { GradingRequirement, GradingRubric } from "@/app/types";
import { maxRequirementKeyNumber } from "./grading";

const RequirementStatusSchema = z.enum(REQUIREMENT_STATUSES);
const QualityLevelSchema = z.enum(QUALITY_LEVELS);

const RequirementKeySchema = z.string().trim().min(1).max(40);

const GradingRequirementSchema = z.object({
  key: RequirementKeySchema,
  name: z.string().trim().min(1).max(GRADING_REQUIREMENT_NAME_MAX_LENGTH),
  description: z.string().trim().max(GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH),
});

const hasUniqueKeys = (requirements: readonly { key: string }[]) =>
  new Set(requirements.map((requirement) => requirement.key)).size === requirements.length;

/**
 * Rubric as the editor submits it: no version (the server derives it from the stored rubric, so a
 * client can't skip or reuse a version number).
 */
export const GradingRubricInputSchema = z.object({
  requirements: z
    .array(GradingRequirementSchema)
    .min(GRADING_RUBRIC_MIN_REQUIREMENTS)
    .max(GRADING_RUBRIC_MAX_REQUIREMENTS)
    .refine(hasUniqueKeys, { message: "要件のキーが重複しています" }),
});

export type GradingRubricInput = z.infer<typeof GradingRubricInputSchema>;

/** Stored rubric (learning_contents.grading_rubric). */
export const GradingRubricSchema = GradingRubricInputSchema.extend({
  version: z.number().int().positive(),
  max_key_number: z.number().int().nonnegative().optional(),
});

/** Unusable stored values count as "no rubric" so a bad row degrades to estimated grading. */
export function parseGradingRubric(value: unknown): GradingRubric | null {
  const parsed = GradingRubricSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeRequirements(requirements: readonly GradingRequirement[]): GradingRequirement[] {
  return requirements.map(({ key, name, description }) => ({
    key,
    name: name.trim(),
    description: description.trim(),
  }));
}

/**
 * Version bumps only when the requirement list actually changes, so re-saving an unchanged form
 * keeps `rubric_version` on past reviews pointing at the same criteria. The key high-water mark is
 * derived here (never taken from the client) and only ever grows, so deleting the newest
 * requirement and adding another can't hand its key out again.
 */
export function nextGradingRubric(
  current: GradingRubric | null,
  input: GradingRubricInput
): GradingRubric {
  const requirements = normalizeRequirements(input.requirements);
  const requirementKeys = requirements.map((requirement) => requirement.key);
  if (!current) {
    return { version: 1, requirements, max_key_number: maxRequirementKeyNumber(requirementKeys) };
  }
  const unchanged =
    JSON.stringify(normalizeRequirements(current.requirements)) === JSON.stringify(requirements);
  const maxKeyNumber = Math.max(
    current.max_key_number ?? 0,
    maxRequirementKeyNumber(current.requirements.map((requirement) => requirement.key)),
    maxRequirementKeyNumber(requirementKeys)
  );
  return {
    version: unchanged ? current.version : current.version + 1,
    requirements,
    max_key_number: maxKeyNumber,
  };
}

const ReviewTextSchema = z.string().trim().min(1);

const ReviewRequirementBaseSchema = z.object({
  key: RequirementKeySchema,
  status: RequirementStatusSchema,
  comment: ReviewTextSchema,
});

const ReviewBodySchema = z.object({
  code_quality: z.object({ level: QualityLevelSchema, comment: ReviewTextSchema }),
  suggestions: z.array(ReviewTextSchema).max(REVIEW_MAX_SUGGESTIONS),
  advice: ReviewTextSchema,
});

/** AI output when a rubric exists: only keys, never names (the code fills names in). */
export function buildRubricReviewSchema(rubric: GradingRubric) {
  const expectedKeys = rubric.requirements.map((requirement) => requirement.key);
  return ReviewBodySchema.extend({
    requirements: z.array(ReviewRequirementBaseSchema).superRefine((items, ctx) => {
      const returned = items.map((item) => item.key);
      const unknown = returned.filter((key) => !expectedKeys.includes(key));
      const missing = expectedKeys.filter((key) => !returned.includes(key));
      const hasDuplicates = new Set(returned).size !== returned.length;
      if (
        unknown.length > 0 ||
        missing.length > 0 ||
        hasDuplicates ||
        items.length !== expectedKeys.length
      ) {
        ctx.addIssue({
          code: "custom",
          message: `要件のキーが採点基準と一致しません（不明: ${unknown.join(",") || "なし"} / 不足: ${missing.join(",") || "なし"}）`,
        });
      }
    }),
  });
}

/** AI output without a rubric: the AI numbers its own requirements and names them. */
export const EstimatedReviewSchema = ReviewBodySchema.extend({
  requirements: z
    .array(
      ReviewRequirementBaseSchema.extend({
        name: z.string().trim().min(1).max(GRADING_REQUIREMENT_NAME_MAX_LENGTH),
      })
    )
    .min(1)
    .max(ESTIMATED_MAX_REQUIREMENTS)
    .refine(hasUniqueKeys, { message: "要件のキーが重複しています" }),
});

/** URL submissions skip requirement grading entirely; the code pins quality to "fair". */
export const UrlReviewSchema = z.object({
  code_quality: z.object({ comment: ReviewTextSchema }),
  suggestions: z.array(ReviewTextSchema).max(REVIEW_MAX_SUGGESTIONS),
  advice: ReviewTextSchema,
});

export const GradingRubricDraftSchema = z.object({
  requirements: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(GRADING_REQUIREMENT_NAME_MAX_LENGTH),
        description: z.string().trim().max(GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH),
      })
    )
    .min(GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS)
    .max(GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS),
});
