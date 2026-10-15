import { describe, expect, it } from "vitest";
import {
  countUnovercomeReviewItems,
  deriveReviewListItems,
  type ReviewListSourceReview,
  sortReviewItemsByLearningOrder,
} from "@/app/lib/review-list";
import type { ReviewJson } from "@/app/types";

function reviewJson(
  requirements: ReviewJson["requirements"],
  extras: Partial<ReviewJson> = {}
): ReviewJson {
  return {
    requirements,
    code_quality: { level: "fair", comment: "ok" },
    suggestions: [],
    advice: "advice",
    ...extras,
  };
}

function source(
  partial: Omit<ReviewListSourceReview, "reviewedAt" | "reviewJson"> & {
    reviewedAt?: string;
    reviewJson: unknown;
  }
): ReviewListSourceReview {
  return {
    reviewedAt: partial.reviewedAt ?? `2026-01-0${partial.id}T00:00:00.000Z`,
    ...partial,
  };
}

describe("deriveReviewListItems", () => {
  it("partial / unmet のみを復習項目にし、met は項目にしない", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "rubric",
        reviewJson: reviewJson([
          { key: "r1", name: "要件1", status: "met", comment: "ok" },
          { key: "r2", name: "要件2", status: "partial", comment: "ほぼ" },
          { key: "r3", name: "要件3", status: "unmet", comment: "未達" },
        ]),
      }),
    ]);

    expect(items.map((item) => item.requirementKey).sort()).toEqual(["r2", "r3"]);
    expect(items.every((item) => !item.overcome)).toBe(true);
    expect(countUnovercomeReviewItems(items)).toBe(2);
  });

  it("新しいレビューで met になると克服済みになる", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "rubric",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "r1", name: "要件1", status: "unmet", comment: "足りない" },
        ]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "rubric",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "r1", name: "要件1", status: "met", comment: "達成" }]),
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].overcome).toBe(true);
    expect(countUnovercomeReviewItems(items)).toBe(0);
  });

  it("rubric_version 変更で消えた key は克服済みになる", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "rubric",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "r1", name: "旧要件", status: "unmet", comment: "旧" },
          { key: "r2", name: "残る", status: "partial", comment: "部分" },
        ]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "rubric",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "r2", name: "残る", status: "partial", comment: "まだ" }]),
      }),
    ]);

    const byKey = Object.fromEntries(items.map((item) => [item.requirementKey, item]));
    expect(byKey.r1.overcome).toBe(true);
    expect(byKey.r2.overcome).toBe(false);
    expect(byKey.r2.comment).toBe("まだ");
  });

  it("同じコンテンツに rubric があれば estimated 由来は表示しない", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "e1", name: "推測", status: "unmet", comment: "estimated" },
        ]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "rubric",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "r1", name: "正式", status: "partial", comment: "rubric" }]),
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].scoreKind).toBe("rubric");
    expect(items[0].requirementKey).toBe("r1");
  });

  it("estimated のみのときは (contentId, reviewId, key) で項目になる", () => {
    const items = deriveReviewListItems([
      source({
        id: 5,
        contentId: 10,
        scoreKind: "estimated",
        reviewJson: reviewJson([
          { key: "e1", name: "推測1", status: "unmet", comment: "コメント" },
        ]),
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        contentId: 10,
        requirementKey: "e1",
        reviewId: 5,
        scoreKind: "estimated",
        overcome: false,
      }),
    ]);
  });

  it("legacy / none / incomplete は対象外", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "legacy",
        reviewJson: reviewJson([{ key: "r1", name: "旧", status: "unmet", comment: "x" }]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "none",
        reviewJson: reviewJson([]),
      }),
      source({
        id: 3,
        contentId: 10,
        scoreKind: "incomplete",
        reviewJson: reviewJson([{ key: "r1", name: "途中", status: "unmet", comment: "x" }]),
      }),
    ]);

    expect(items).toEqual([]);
  });

  it("不正な review_json は無視する", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "rubric",
        reviewJson: { broken: true },
      }),
    ]);
    expect(items).toEqual([]);
  });
});

describe("sortReviewItemsByLearningOrder", () => {
  it("テーマ→コンテンツの学習順で並べ、同一コンテンツ内は key 順", () => {
    const order = new Map([
      [20, 0],
      [10, 1],
    ]);
    const sorted = sortReviewItemsByLearningOrder(
      [
        { contentId: 10, requirementKey: "r2" },
        { contentId: 20, requirementKey: "r9" },
        { contentId: 10, requirementKey: "r1" },
      ],
      order
    );
    expect(sorted.map((item) => `${item.contentId}:${item.requirementKey}`)).toEqual([
      "20:r9",
      "10:r1",
      "10:r2",
    ]);
  });
});
