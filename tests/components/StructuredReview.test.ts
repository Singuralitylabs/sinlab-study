import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import { StructuredReview } from "@/app/components/StructuredReview";
import type { AIReviewListItem, ReviewJson, ScoreKind } from "@/app/types";

const reviewJson: ReviewJson = {
  requirements: [
    { key: "r1", name: "フォームがある", status: "met", comment: "OK です" },
    { key: "r2", name: "検証する", status: "unmet", comment: "未実装です" },
  ],
  code_quality: { level: "fair", comment: "標準的" },
  suggestions: ["関数を分ける"],
  advice: "次は検証を足しましょう",
};

const renderReview = (scoreKind: ScoreKind, passDisplay: "passed" | "retry" | null = null) =>
  renderToStaticMarkup(createElement(StructuredReview, { reviewJson, scoreKind, passDisplay }));

const listItem = (overrides: Partial<AIReviewListItem> = {}): AIReviewListItem =>
  ({
    id: 1,
    status: "completed",
    overall_score: 45,
    review_content: "## レガシー本文\n旧形式のレビューです",
    reviewed_at: "2026-10-12T00:00:00Z",
    error_message: null,
    review_json: reviewJson,
    score_kind: "rubric",
    rubric_version: 1,
    passed: null,
    ...overrides,
  }) as AIReviewListItem;

const renderDisplay = (review: AIReviewListItem) =>
  renderToStaticMarkup(createElement(AIReviewDisplay, { review, defaultExpanded: true }));

describe("StructuredReview", () => {
  it("要件ごとの判定ラベル・コメント・品質・提案・アドバイスを表示する", () => {
    const html = renderReview("rubric");
    expect(html).toContain("フォームがある");
    expect(html).toContain("達成");
    expect(html).toContain("未達成");
    expect(html).toContain("未実装です");
    expect(html).toContain("標準");
    expect(html).toContain("関数を分ける");
    expect(html).toContain("次は検証を足しましょう");
  });

  it("estimated は参考採点の注記を表示する", () => {
    expect(renderReview("estimated")).toContain("参考採点（採点基準未設定）");
  });

  it("同じ文面の改善提案が複数あっても key の重複警告を出さずすべて表示する", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(
      createElement(StructuredReview, {
        reviewJson: { ...reviewJson, suggestions: ["関数を分ける", "関数を分ける"] },
        scoreKind: "rubric",
        passDisplay: null,
      })
    );
    expect(html.match(/関数を分ける/g)).toHaveLength(2);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("none は採点対象外の注記を表示し、仮置きの品質ラベルは出さない", () => {
    const html = renderReview("none");
    expect(html).toContain("URL 提出のため採点対象外です");
    expect(html).toContain("補足");
    expect(html).toContain("標準的");
    expect(html).not.toContain("コード品質");
  });

  it("retry のときだけ再提出の案内を表示する", () => {
    expect(renderReview("rubric", "retry")).toContain("再レビューできます");
    expect(renderReview("rubric", "passed")).not.toContain("再レビューできます");
    expect(renderReview("rubric", null)).not.toContain("再レビューできます");
  });
});

describe("AIReviewDisplay", () => {
  it("構造化レビューは review_json から描画し、点数バッジを出す", () => {
    const html = renderDisplay(listItem());
    expect(html).toContain("45/100");
    expect(html).toContain("未実装です");
    expect(html).not.toContain("レガシー本文");
  });

  it("legacy は review_content をそのまま表示する", () => {
    const html = renderDisplay(listItem({ score_kind: "legacy", review_json: null }));
    expect(html).toContain("レガシー本文");
  });

  it("review_json が不正でも review_content に退避する（クラッシュしない）", () => {
    const html = renderDisplay(listItem({ review_json: { broken: true } as never }));
    expect(html).toContain("レガシー本文");
  });

  it("estimated / none にはバッジを付け、合否バッジは出さない", () => {
    expect(renderDisplay(listItem({ score_kind: "estimated", passed: true }))).toContain("参考");
    expect(renderDisplay(listItem({ score_kind: "none", overall_score: null }))).toContain(
      "採点対象外"
    );
  });

  it("完了済みには再試行ボタンを出さない（同じ提出の再レビューは必ず 429 になる）", () => {
    const html = renderToStaticMarkup(
      createElement(AIReviewDisplay, {
        review: listItem(),
        onRetry: () => undefined,
        defaultExpanded: false,
      })
    );
    expect(html).not.toContain("再試行");
  });

  it("失敗したレビューだけ再試行できる", () => {
    const html = renderToStaticMarkup(
      createElement(AIReviewDisplay, {
        review: listItem({ status: "failed", error_message: "timeout" }),
        onRetry: () => undefined,
        defaultExpanded: false,
      })
    );
    expect(html).toContain("再試行");
  });

  it("受講生向けの表示にトークン数は出ない", () => {
    const html = renderDisplay(
      listItem({ prompt_tokens: 111, completion_tokens: 222, thoughts_tokens: 333 } as never)
    );
    expect(html).not.toMatch(/111|222|333|トークン/);
  });
});
