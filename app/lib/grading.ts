import {
  CERTIFICATE_PASS_SCORE,
  QUALITY_LEVELS,
  QUALITY_POINTS,
  QUALITY_WEIGHT,
  REQUIREMENT_STATUSES,
  REQUIREMENT_WEIGHT,
  STATUS_POINTS,
} from "@/app/constants/grading";
import type { GradingRequirement, ReviewJson, ScoreKind } from "@/app/types";

/**
 * 0-100 integer, or null when there are no requirements to average (URL submissions). Scores and
 * pass/fail come from the AI's labels only: never feed a number the AI wrote into a score or a
 * pass decision, because its numbers drift between runs while the labels barely do.
 */
export function computeReviewScore(reviewJson: ReviewJson): number | null {
  const { requirements, code_quality: codeQuality } = reviewJson;
  if (requirements.length === 0) {
    return null;
  }

  const requirementAverage =
    requirements.reduce((sum, requirement) => sum + STATUS_POINTS[requirement.status], 0) /
    requirements.length;
  const raw =
    requirementAverage * REQUIREMENT_WEIGHT + QUALITY_POINTS[codeQuality.level] * QUALITY_WEIGHT;

  return Math.round(raw);
}

/**
 * Only call for score_kind = rubric. Returns null while the pass score is 0 (disabled), so a
 * threshold-less environment never records a pass/fail verdict.
 */
export function isReviewPassed(
  reviewJson: ReviewJson,
  score: number | null,
  passScore: number = CERTIFICATE_PASS_SCORE
): boolean | null {
  if (passScore <= 0 || score === null) {
    return null;
  }
  const hasUnmet = reviewJson.requirements.some((requirement) => requirement.status === "unmet");
  return !hasUnmet && score >= passScore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows a stored review_json (Json from the DB). Returns null for anything unrecognisable so
 * display can fall back to review_content instead of crashing on a malformed row.
 */
export function asReviewJson(value: unknown): ReviewJson | null {
  if (!isRecord(value) || !Array.isArray(value.requirements) || !isRecord(value.code_quality)) {
    return null;
  }
  const { code_quality: codeQuality, suggestions, advice } = value;
  if (
    typeof codeQuality.level !== "string" ||
    !(QUALITY_LEVELS as readonly string[]).includes(codeQuality.level) ||
    typeof codeQuality.comment !== "string" ||
    !Array.isArray(suggestions) ||
    !suggestions.every((item) => typeof item === "string") ||
    typeof advice !== "string"
  ) {
    return null;
  }
  const requirementsValid = value.requirements.every(
    (item) =>
      isRecord(item) &&
      typeof item.key === "string" &&
      typeof item.status === "string" &&
      (REQUIREMENT_STATUSES as readonly string[]).includes(item.status) &&
      typeof item.comment === "string" &&
      (item.name === undefined || typeof item.name === "string")
  );
  return requirementsValid ? (value as ReviewJson) : null;
}

const STATUS_LABELS: Record<ReviewJson["requirements"][number]["status"], string> = {
  met: "達成",
  partial: "部分的",
  unmet: "未達成",
};

const QUALITY_LABELS: Record<ReviewJson["code_quality"]["level"], string> = {
  good: "良好",
  fair: "標準",
  poor: "要改善",
};

export function getRequirementStatusLabel(status: keyof typeof STATUS_LABELS): string {
  return STATUS_LABELS[status];
}

export function getQualityLevelLabel(level: keyof typeof QUALITY_LABELS): string {
  return QUALITY_LABELS[level];
}

/** Notes shown with a non-rubric score; shared by the structured view and the saved Markdown. */
export const SCORE_KIND_NOTES: Partial<Record<ScoreKind, string>> = {
  estimated:
    "参考採点（採点基準未設定）: この点数は AI が要件を推測したもので、修了判定には使われません。",
  none: "URL 提出のため採点対象外です。",
};

/** Markdown saved to ai_reviews.review_content so the existing display components keep working. */
export function renderReviewMarkdown(
  reviewJson: ReviewJson,
  score: number | null,
  scoreKind: ScoreKind
): string {
  const sections: string[] = [];

  const note = SCORE_KIND_NOTES[scoreKind];
  if (note) {
    sections.push(`> ${note}`);
  }

  if (reviewJson.requirements.length > 0) {
    const lines = reviewJson.requirements.map((requirement) => {
      const name = requirement.name ?? requirement.key;
      return `- **${name}**: ${STATUS_LABELS[requirement.status]} — ${requirement.comment}`;
    });
    sections.push(`## 1. 要件達成度\n${lines.join("\n")}`);
  }

  // URL reviews pin the level to "fair" because the model never saw the code. Showing that
  // label would be a verdict nobody made; the comment is the only part the model actually wrote.
  sections.push(
    scoreKind === "none"
      ? `## 2. 補足\n${reviewJson.code_quality.comment}`
      : `## 2. コード品質・可読性\n**${QUALITY_LABELS[reviewJson.code_quality.level]}** — ${reviewJson.code_quality.comment}`
  );

  if (reviewJson.suggestions.length > 0) {
    const lines = reviewJson.suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`);
    sections.push(`## 3. 改善提案\n${lines.join("\n")}`);
  }

  sections.push(`## 4. 学習アドバイス\n${reviewJson.advice}`);

  if (score !== null) {
    sections.push(`## 5. スコア\n**${score}/100**`);
  }

  return sections.join("\n\n");
}

export type PassDisplay = "passed" | "retry";

/**
 * Pass/retry badge shown only for rubric grading with the pass score enabled. Estimated, none and
 * legacy reviews never show a verdict because they are not used for the completion decision.
 */
export function resolvePassDisplay(
  review: { score_kind: ScoreKind; passed: boolean | null },
  passScore: number = CERTIFICATE_PASS_SCORE
): PassDisplay | null {
  if (review.score_kind !== "rubric" || passScore <= 0 || review.passed === null) {
    return null;
  }
  return review.passed ? "passed" : "retry";
}

export const SCORE_KIND_BADGE_LABELS: Partial<Record<ScoreKind, string>> = {
  estimated: "参考",
  none: "採点対象外",
};

/** Version of a stored rubric, or null when unset or unrecognisable (no zod: client-safe). */
export function getGradingRubricVersion(value: unknown): number | null {
  if (!isRecord(value) || !Array.isArray(value.requirements) || value.requirements.length === 0) {
    return null;
  }
  const { version } = value;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : null;
}

/** Rows for the rubric editor from a stored value; empty when unset or unrecognisable. */
export function toRubricFormRows(value: unknown): GradingRequirement[] {
  if (!isRecord(value) || !Array.isArray(value.requirements)) {
    return [];
  }
  return value.requirements.flatMap((item) =>
    isRecord(item) && typeof item.key === "string" && typeof item.name === "string"
      ? [
          {
            key: item.key,
            name: item.name,
            description: typeof item.description === "string" ? item.description : "",
          },
        ]
      : []
  );
}

function requirementKeyNumber(key: string): number {
  const match = /^r(\d+)$/.exec(key);
  return match ? Number(match[1]) : 0;
}

/** Highest `r{n}` number among the keys; 0 when none match. */
export function maxRequirementKeyNumber(keys: readonly string[]): number {
  return keys.reduce((highest, key) => Math.max(highest, requirementKeyNumber(key)), 0);
}

/**
 * Highest key number ever issued for a stored rubric: the persisted high-water mark, or the keys
 * still present for rubrics saved before the mark existed. 0 when unset or unrecognisable.
 */
export function getRubricMaxKeyNumber(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const stored =
    typeof value.max_key_number === "number" && Number.isInteger(value.max_key_number)
      ? Math.max(0, value.max_key_number)
      : 0;
  return Math.max(stored, maxRequirementKeyNumber(toRubricFormRows(value).map((row) => row.key)));
}

/**
 * Next `r{n}` key above both the keys in use and `issuedMax` (the highest number ever issued).
 * Keys are never reused for another requirement within a rubric, so a review's key keeps pointing
 * at the same requirement after reordering or deleting rows; `issuedMax` is what remembers the
 * deleted ones.
 */
export function nextRequirementKey(existingKeys: readonly string[], issuedMax = 0): string {
  return `r${Math.max(issuedMax, maxRequirementKeyNumber(existingKeys)) + 1}`;
}

/**
 * Keys the client invented that were already issued and then removed. The editor skips these,
 * but the API accepts any unique key, so the server has to reject them or a deleted r3 can name
 * a different requirement while old reviews still point at r3. Only `r{n}` keys are issued
 * numbers; anything else is a new key (uniqueness is checked separately) and must not be
 * rejected just because `requirementKeyNumber` maps it to 0.
 */
export function reusedRequirementKeys(
  current: { requirements: readonly { key: string }[]; max_key_number?: number },
  incomingKeys: readonly string[]
): string[] {
  // The API trims submitted keys. A stored key that only differs by surrounding spaces is
  // still that requirement; comparing the raw string would reject the editor's trimmed key.
  const currentKeys = new Set(current.requirements.map((requirement) => requirement.key.trim()));
  const highWater = Math.max(
    current.max_key_number ?? 0,
    maxRequirementKeyNumber(current.requirements.map((requirement) => requirement.key.trim()))
  );
  return incomingKeys.filter((key) => {
    const normalized = key.trim();
    return (
      !currentKeys.has(normalized) &&
      /^r\d+$/.test(normalized) &&
      requirementKeyNumber(normalized) <= highWater
    );
  });
}
