import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_PASS_SCORE,
  QUALITY_WEIGHT,
  REQUIREMENT_WEIGHT,
} from "@/app/constants/grading";
import {
  asReviewJson,
  computeReviewScore,
  getGradingRubricVersion,
  getRubricMaxKeyNumber,
  isReviewPassed,
  nextRequirementKey,
  renderReviewMarkdown,
  resolvePassDisplay,
  reusedRequirementKeys,
  SCORE_KIND_NOTES,
  toRubricFormRows,
} from "@/app/lib/grading";
import type { ReviewJson } from "@/app/types";

type Status = "met" | "partial" | "unmet";
type Level = "good" | "fair" | "poor";

const review = (statuses: Status[], level: Level = "good"): ReviewJson => ({
  requirements: statuses.map((status, index) => ({
    key: `r${index + 1}`,
    name: `要件${index + 1}`,
    status,
    comment: `コメント${index + 1}`,
  })),
  code_quality: { level, comment: "品質コメント" },
  suggestions: ["提案1"],
  advice: "アドバイス",
});

describe("computeReviewScore", () => {
  it("配点は要件80 + 品質20 = 100", () => {
    expect(REQUIREMENT_WEIGHT + QUALITY_WEIGHT).toBe(100);
  });

  it("全要件達成 + 品質 good は 100", () => {
    expect(computeReviewScore(review(["met", "met", "met"], "good"))).toBe(100);
  });

  it("全要件未達成 + 品質 poor は 0", () => {
    expect(computeReviewScore(review(["unmet", "unmet"], "poor"))).toBe(0);
  });

  it("要件は met=1 / partial=0.5 / unmet=0 の平均で按分する", () => {
    // (1 + 0.5 + 0 + 0.5) / 4 = 0.5 -> 40, quality fair -> 10
    expect(computeReviewScore(review(["met", "partial", "unmet", "partial"], "fair"))).toBe(50);
  });

  it("要件が全て達成でも品質で差が付く（good 100 / fair 90 / poor 80）", () => {
    expect(computeReviewScore(review(["met"], "good"))).toBe(100);
    expect(computeReviewScore(review(["met"], "fair"))).toBe(90);
    expect(computeReviewScore(review(["met"], "poor"))).toBe(80);
  });

  it("整数に丸める", () => {
    // 1/3 * 80 = 26.67 -> 27, + 20 = 47 (rounded once at the end: 46.67 -> 47)
    expect(computeReviewScore(review(["met", "unmet", "unmet"], "good"))).toBe(47);
  });

  it("要件が0件（URL提出）は null", () => {
    expect(computeReviewScore(review([], "fair"))).toBeNull();
  });

  it("同じ判定ラベルなら常に同じ点数になる（AIの数値に依存しない）", () => {
    const a = { ...review(["met", "partial"]), score: 1 } as ReviewJson;
    const b = { ...review(["met", "partial"]), score: 99 } as ReviewJson;
    expect(computeReviewScore(a)).toBe(computeReviewScore(b));
  });
});

describe("isReviewPassed", () => {
  it("既定（CERTIFICATE_PASS_SCORE = 0）では判定せず null（passed は NULL のまま）", () => {
    expect(CERTIFICATE_PASS_SCORE).toBe(0);
    expect(isReviewPassed(review(["met"]), 100)).toBeNull();
  });

  it("閾値が有効なとき: 点数が閾値以上かつ未達成なしで true", () => {
    expect(isReviewPassed(review(["met", "partial"]), 80, 70)).toBe(true);
    expect(isReviewPassed(review(["met"]), 70, 70)).toBe(true);
  });

  it("閾値未満は false", () => {
    expect(isReviewPassed(review(["met"]), 69, 70)).toBe(false);
  });

  it("点数が閾値以上でも未達成の要件が1つでもあれば false", () => {
    expect(isReviewPassed(review(["met", "met", "met", "met", "unmet"], "good"), 96, 70)).toBe(
      false
    );
  });

  it("点数が null なら null", () => {
    expect(isReviewPassed(review([]), null, 70)).toBeNull();
  });
});

describe("resolvePassDisplay", () => {
  it("rubric 以外は常に null", () => {
    for (const score_kind of ["estimated", "none", "legacy"] as const) {
      expect(resolvePassDisplay({ score_kind, passed: true }, 70)).toBeNull();
    }
  });

  it("閾値が無効（0）なら rubric でも null", () => {
    expect(resolvePassDisplay({ score_kind: "rubric", passed: true }, 0)).toBeNull();
  });

  it("passed が null なら null", () => {
    expect(resolvePassDisplay({ score_kind: "rubric", passed: null }, 70)).toBeNull();
  });

  it("rubric + 有効な閾値: passed に応じて passed / retry", () => {
    expect(resolvePassDisplay({ score_kind: "rubric", passed: true }, 70)).toBe("passed");
    expect(resolvePassDisplay({ score_kind: "rubric", passed: false }, 70)).toBe("retry");
  });
});

describe("renderReviewMarkdown", () => {
  it("rubric: 要件・品質・提案・アドバイス・スコアを含み、参考採点の注記は付けない", () => {
    const md = renderReviewMarkdown(review(["met", "unmet"]), 60, "rubric");
    expect(md).toContain("## 1. 要件達成度");
    expect(md).toContain("- **要件1**: 達成 — コメント1");
    expect(md).toContain("- **要件2**: 未達成 — コメント2");
    expect(md).toContain("**良好** — 品質コメント");
    expect(md).toContain("1. 提案1");
    expect(md).toContain("アドバイス");
    expect(md).toContain("**60/100**");
    expect(md).not.toContain("参考採点");
  });

  it("注記は構造化表示と共有する SCORE_KIND_NOTES と同じ文面を引用で入れる", () => {
    expect(renderReviewMarkdown(review(["met"]), 90, "estimated")).toContain(
      `> ${SCORE_KIND_NOTES.estimated}`
    );
    expect(renderReviewMarkdown(review([]), null, "none")).toContain(`> ${SCORE_KIND_NOTES.none}`);
  });

  it("estimated: 参考採点であり修了判定に使われない旨を明記する", () => {
    const md = renderReviewMarkdown(review(["met"]), 90, "estimated");
    expect(md).toContain("参考採点（採点基準未設定）");
    expect(md).toContain("修了判定には使われません");
  });

  it("none: 採点対象外と明記し、スコア行と品質ラベルを出さない", () => {
    const md = renderReviewMarkdown(review([]), null, "none");
    expect(md).toContain("URL 提出のため採点対象外です");
    expect(md).toContain("## 2. 補足");
    expect(md).not.toContain("スコア");
    expect(md).not.toContain("要件達成度");
    expect(md).not.toContain("**良好**");
    expect(md).not.toContain("コード品質");
  });

  it("改善提案が空なら節を出さない", () => {
    const md = renderReviewMarkdown({ ...review(["met"]), suggestions: [] }, 100, "rubric");
    expect(md).not.toContain("改善提案");
  });
});

describe("asReviewJson", () => {
  it("正しい形はそのまま返す", () => {
    const value = review(["met"]);
    expect(asReviewJson(value)).toBe(value);
  });

  it.each([
    ["null", null],
    ["配列", []],
    ["requirements 欠落", { code_quality: { level: "good", comment: "c" } }],
    [
      "品質レベルが列挙外",
      { ...review(["met"]), code_quality: { level: "excellent", comment: "c" } },
    ],
    ["suggestions が文字列配列でない", { ...review(["met"]), suggestions: [1] }],
    [
      "要件の status が列挙外",
      { ...review(["met"]), requirements: [{ key: "r1", status: "ok", comment: "c" }] },
    ],
  ])("不正な形（%s）は null を返し、表示側が review_content に退避できる", (_label, value) => {
    expect(asReviewJson(value)).toBeNull();
  });
});

describe("getGradingRubricVersion / toRubricFormRows / nextRequirementKey / getRubricMaxKeyNumber", () => {
  const rubric = {
    version: 4,
    requirements: [
      { key: "r1", name: "A", description: "a" },
      { key: "r3", name: "B", description: "b" },
    ],
  };

  it("保存済み採点基準のバージョンを返す。未設定・不正は null", () => {
    expect(getGradingRubricVersion(rubric)).toBe(4);
    expect(getGradingRubricVersion(null)).toBeNull();
    expect(getGradingRubricVersion({ version: 0, requirements: rubric.requirements })).toBeNull();
    expect(getGradingRubricVersion({ version: 1, requirements: [] })).toBeNull();
    expect(getGradingRubricVersion({ version: 1.5, requirements: rubric.requirements })).toBeNull();
  });

  it("エディタ用の行に展開する（不正は空）", () => {
    expect(toRubricFormRows(rubric)).toEqual(rubric.requirements);
    expect(toRubricFormRows(null)).toEqual([]);
    expect(toRubricFormRows({ requirements: [{ key: 1 }] })).toEqual([]);
  });

  it("次の key は既存の最大番号 + 1（欠番や並べ替えがあっても再利用しない）", () => {
    expect(nextRequirementKey([])).toBe("r1");
    expect(nextRequirementKey(["r1", "r3"])).toBe("r4");
    expect(nextRequirementKey(["custom", "r2"])).toBe("r3");
  });

  it("発行済み以下の新しい key は再利用として弾く。現存 key と、より大きい番号は通す", () => {
    const current = {
      requirements: [{ key: "r1" }, { key: "r2" }],
      max_key_number: 3,
    };
    expect(reusedRequirementKeys(current, ["r1", "r3"])).toEqual(["r3"]);
    expect(reusedRequirementKeys(current, ["r1", "r2"])).toEqual([]);
    expect(reusedRequirementKeys(current, ["r1", "r4"])).toEqual([]);
    expect(reusedRequirementKeys(current, ["r1", "custom"])).toEqual([]);
  });

  it("削除済みの最大番号を issuedMax で覚え、その key を新しい要件に再利用しない", () => {
    expect(nextRequirementKey(["r1", "r2"], 3)).toBe("r4");
    expect(nextRequirementKey(["r1", "r5"], 3)).toBe("r6");
  });

  it("発行済みの最大番号は保存値と現存 key の大きい方。未設定・不正は 0", () => {
    expect(getRubricMaxKeyNumber({ ...rubric, max_key_number: 7 })).toBe(7);
    expect(getRubricMaxKeyNumber({ ...rubric, max_key_number: 2 })).toBe(3);
    expect(getRubricMaxKeyNumber(rubric)).toBe(3);
    expect(getRubricMaxKeyNumber({ ...rubric, max_key_number: "9" })).toBe(3);
    expect(getRubricMaxKeyNumber(null)).toBe(0);
  });
});
