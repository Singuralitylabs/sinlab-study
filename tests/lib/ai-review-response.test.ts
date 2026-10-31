import { describe, expect, it } from "vitest";
import { buildReviewNotice } from "@/app/lib/ai-review-response";

describe("buildReviewNotice", () => {
  it("202 は info として API のメッセージを使う", () => {
    expect(buildReviewNotice(202, { message: "生成中です" })).toEqual({
      type: "info",
      text: "生成中です",
    });
  });

  it("202 でメッセージが無ければ既定文言になる", () => {
    const notice = buildReviewNotice(202, null);
    expect(notice?.type).toBe("info");
    expect(notice?.text).toContain("生成中");
  });

  it.each([409, 429])("%i は提出が保存済みであることを添えたエラーになる", (status) => {
    expect(buildReviewNotice(status, { error: "本日の上限に達しました" })).toEqual({
      type: "error",
      text: "提出は保存されました。本日の上限に達しました",
    });
  });

  it("429 で本文が読めなくても上限の既定文言を返す", () => {
    const notice = buildReviewNotice(429, null);
    expect(notice?.text).toContain("提出は保存されました。");
    expect(notice?.text).toContain("回数上限");
  });

  it("再試行では提出が保存されたとは言わない", () => {
    expect(
      buildReviewNotice(429, { error: "本日の上限に達しました" }, { submissionJustSaved: false })
    ).toEqual({ type: "error", text: "本日の上限に達しました" });
  });

  it("その他のステータスは扱わない", () => {
    expect(buildReviewNotice(500, { error: "x" })).toBeNull();
    expect(buildReviewNotice(200, {})).toBeNull();
  });
});
