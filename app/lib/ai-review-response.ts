export type ReviewNotice = { type: "info" | "error"; text: string };

const GENERATING_FALLBACK =
  "AIレビューは現在生成中です。しばらくしてからページを再読み込みしてください";
const LIMIT_FALLBACK = "AIレビューの回数上限に達しました。時間をおいて再度お試しください";

/**
 * Maps the non-review responses of `POST /api/ai-review` (202 in progress, 409 busy, 429 limit)
 * to a notice. The submission is already saved at this point, so the 409/429 text says so;
 * otherwise a red error right after "submitted" reads as if the submission itself was lost.
 */
export function buildReviewNotice(status: number, data: unknown): ReviewNotice | null {
  const body = (data ?? {}) as { message?: unknown; error?: unknown };
  if (status === 202) {
    return {
      type: "info",
      text: typeof body.message === "string" ? body.message : GENERATING_FALLBACK,
    };
  }
  if (status === 409 || status === 429) {
    const detail = typeof body.error === "string" ? body.error : LIMIT_FALLBACK;
    return { type: "error", text: `提出は保存されました。${detail}` };
  }
  return null;
}
