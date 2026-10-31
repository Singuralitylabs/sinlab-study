export interface DryRunSample {
  contentId: number;
  score: number | null;
  /** Requirement statuses of the run, to evaluate "no unmet requirement" for pass candidates. */
  hasUnmet: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  thoughtsTokens: number | null;
}

export interface ContentSummary {
  contentId: number;
  samples: number;
  mean: number | null;
  median: number | null;
  /** Share (0-1) of samples that would pass at each candidate threshold. */
  passRates: Record<number, number>;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  avgThoughtsTokens: number | null;
}

export const CANDIDATE_THRESHOLDS = [60, 70, 80, 90] as const;

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const nonNull = (values: readonly (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null);

export function summarizeByContent(samples: readonly DryRunSample[]): ContentSummary[] {
  const byContent = new Map<number, DryRunSample[]>();
  for (const sample of samples) {
    byContent.set(sample.contentId, [...(byContent.get(sample.contentId) ?? []), sample]);
  }

  return [...byContent.entries()]
    .sort(([a], [b]) => a - b)
    .map(([contentId, group]) => {
      const scored = group.filter(
        (sample): sample is DryRunSample & { score: number } => sample.score !== null
      );
      const scores = scored.map((sample) => sample.score);
      const passRates: Record<number, number> = {};
      for (const threshold of CANDIDATE_THRESHOLDS) {
        passRates[threshold] =
          scored.length === 0
            ? 0
            : scored.filter((sample) => !sample.hasUnmet && sample.score >= threshold).length /
              scored.length;
      }
      return {
        contentId,
        samples: group.length,
        mean: average(scores),
        median: median(scores),
        passRates,
        avgPromptTokens: average(nonNull(group.map((s) => s.promptTokens))),
        avgCompletionTokens: average(nonNull(group.map((s) => s.completionTokens))),
        avgThoughtsTokens: average(nonNull(group.map((s) => s.thoughtsTokens))),
      };
    });
}

const fixed = (value: number | null, digits = 1): string =>
  value === null ? "-" : value.toFixed(digits);

export function formatSummary(summary: ContentSummary): string {
  const rates = CANDIDATE_THRESHOLDS.map(
    (threshold) => `${threshold}点以上: ${fixed(summary.passRates[threshold] * 100, 0)}%`
  ).join(" / ");
  return [
    `content ${summary.contentId} (n=${summary.samples})`,
    `  平均 ${fixed(summary.mean)} / 中央値 ${fixed(summary.median)}`,
    `  合格率（未達成なし かつ ${rates}）`,
    `  平均トークン 入力 ${fixed(summary.avgPromptTokens, 0)} / 回答 ${fixed(summary.avgCompletionTokens, 0)} / 思考 ${fixed(summary.avgThoughtsTokens, 0)}`,
  ].join("\n");
}
