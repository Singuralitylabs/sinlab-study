import { describe, expect, it } from "vitest";
import { planPassedBackfill, readArgs } from "@/scripts/backfill-review-passed";

const rubricJson = {
  requirements: [{ key: "r1", name: "要件", status: "met", comment: "ok" }],
  code_quality: { level: "good", comment: "ok" },
  suggestions: [],
  advice: "next",
};

describe("planPassedBackfill", () => {
  it("rubric で passed が NULL の行だけ isReviewPassed で埋める", () => {
    expect(
      planPassedBackfill({
        id: 1,
        score_kind: "rubric",
        passed: null,
        overall_score: 100,
        review_json: rubricJson,
      })
    ).toBe(true);
    expect(
      planPassedBackfill({
        id: 2,
        score_kind: "rubric",
        passed: null,
        overall_score: 69,
        review_json: rubricJson,
      })
    ).toBe(false);
  });

  it("未達成があれば false", () => {
    expect(
      planPassedBackfill({
        id: 3,
        score_kind: "rubric",
        passed: null,
        overall_score: 96,
        review_json: {
          ...rubricJson,
          requirements: [{ key: "r1", name: "要件", status: "unmet", comment: "no" }],
        },
      })
    ).toBe(false);
  });

  it("rubric 以外・既に passed がある行・壊れた JSON は埋めない", () => {
    expect(
      planPassedBackfill({
        id: 4,
        score_kind: "estimated",
        passed: null,
        overall_score: 100,
        review_json: rubricJson,
      })
    ).toBeNull();
    expect(
      planPassedBackfill({
        id: 5,
        score_kind: "rubric",
        passed: true,
        overall_score: 100,
        review_json: rubricJson,
      })
    ).toBeNull();
    expect(
      planPassedBackfill({
        id: 6,
        score_kind: "rubric",
        passed: null,
        overall_score: 100,
        review_json: { broken: true },
      })
    ).toBeNull();
    expect(
      planPassedBackfill({
        id: 7,
        score_kind: "rubric",
        passed: null,
        overall_score: null,
        review_json: rubricJson,
      })
    ).toBeNull();
  });
});

describe("backfill-review-passed readArgs", () => {
  it("--write と --confirm-dev を読む", () => {
    expect(readArgs(["--confirm-dev"])).toEqual({ write: false, confirmed: true });
    expect(readArgs(["--write", "--confirm-dev"])).toEqual({ write: true, confirmed: true });
  });

  it("未知の引数は拒否する", () => {
    expect(() => readArgs(["--production"])).toThrow(/Unknown argument/);
  });
});
