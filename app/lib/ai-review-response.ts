export type ReviewNotice = { type: "info" | "error"; text: string };

const GENERATING_FALLBACK =
  "AIレビューは現在生成中です。しばらくしてからページを再読み込みしてください";
const LIMIT_FALLBACK = "AIレビューの回数上限に達しました。時間をおいて再度お試しください";

/**
 * Maps the non-review responses of `POST /api/ai-review` (202 in progress, 409 busy, 429 limit)
 * to a notice. Right after a new submission the 409/429 text says the submission was saved;
 * otherwise a red error reads as if the submission itself was lost. A retry of an existing
 * submission must not say that — nothing new was saved.
 */
export function buildReviewNotice(
  status: number,
  data: unknown,
  options?: { submissionJustSaved?: boolean }
): ReviewNotice | null {
  const body = (data ?? {}) as { message?: unknown; error?: unknown };
  if (status === 202) {
    return {
      type: "info",
      text: typeof body.message === "string" ? body.message : GENERATING_FALLBACK,
    };
  }
  if (status === 409 || status === 429) {
    const detail = typeof body.error === "string" ? body.error : LIMIT_FALLBACK;
    const prefix = options?.submissionJustSaved === false ? "" : "提出は保存されました。";
    return { type: "error", text: `${prefix}${detail}` };
  }
  return null;
}
