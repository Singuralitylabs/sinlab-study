import { describe, expect, it } from "vitest";
import {
  countUnovercomeReviewItems,
  deriveReviewListItems,
  filterReviewItemsToVisibleContents,
  findOrphanRequirementNotes,
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

  it("estimated のみのときは (contentId, key) で項目になる", () => {
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

  it("estimated は同じ key をレビュー間で共有し、再レビューで unbounded に増えない", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "e1", name: "推測", status: "unmet", comment: "旧" }]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "e1", name: "推測", status: "unmet", comment: "新" }]),
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        requirementKey: "e1",
        reviewId: 2,
        comment: "新",
        overcome: false,
      })
    );
  });

  it("estimated で新しいレビューから消えた key は置き換えられ、克服済みにはしない", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "old", name: "旧キー", status: "unmet", comment: "旧" },
          { key: "keep", name: "残る", status: "partial", comment: "部分" },
        ]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "keep", name: "残る", status: "partial", comment: "まだ" },
          { key: "new", name: "新キー", status: "unmet", comment: "新規" },
        ]),
      }),
    ]);

    const byKey = Object.fromEntries(items.map((item) => [item.requirementKey, item]));
    expect(byKey.old).toBeUndefined();
    expect(byKey.keep).toEqual(
      expect.objectContaining({ overcome: false, reviewId: 2, comment: "まだ" })
    );
    expect(byKey.new).toEqual(expect.objectContaining({ overcome: false, reviewId: 2 }));
    expect(items).toHaveLength(2);
    expect(items.every((item) => !item.overcome)).toBe(true);
  });

  it("estimated で新しいレビューが met にした key は克服済みになる", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "e1", name: "推測", status: "unmet", comment: "未達" }]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([{ key: "e1", name: "推測", status: "met", comment: "達成" }]),
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].overcome).toBe(true);
  });

  it("estimated は最新レビューの unmet/partial だけを open にし、キー改名だけでは克服しない", () => {
    const items = deriveReviewListItems([
      source({
        id: 1,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "error_handling", name: "エラー処理", status: "unmet", comment: "旧" },
        ]),
      }),
      source({
        id: 2,
        contentId: 10,
        scoreKind: "estimated",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewJson: reviewJson([
          { key: "input_validation", name: "入力検証", status: "partial", comment: "新" },
        ]),
      }),
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        requirementKey: "input_validation",
        reviewId: 2,
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

describe("filterReviewItemsToVisibleContents", () => {
  it("公開中コンテンツに無い項目を落とす（件数と一覧の分母を揃える）", () => {
    const items = [
      { contentId: 1, requirementKey: "a" },
      { contentId: 2, requirementKey: "b" },
      { contentId: 3, requirementKey: "c" },
    ];
    expect(
      filterReviewItemsToVisibleContents(items, new Set([1, 3])).map((i) => i.contentId)
    ).toEqual([1, 3]);
  });
});

describe("findOrphanRequirementNotes", () => {
  it("現在の項目に無い requirement_key のメモを残し、自由メモと空行は除外する", () => {
    const orphans = findOrphanRequirementNotes(
      [
        {
          content_id: 10,
          requirement_key: "old",
          memo: "昔のメモ",
          understood_at: null,
        },
        {
          content_id: 10,
          requirement_key: "keep",
          memo: "現役",
          understood_at: null,
        },
        {
          content_id: 10,
          requirement_key: "understood_only",
          memo: null,
          understood_at: "2026-01-01T00:00:00.000Z",
        },
        {
          content_id: 10,
          requirement_key: "empty",
          memo: "  ",
          understood_at: null,
        },
        {
          content_id: 10,
          requirement_key: null,
          memo: "自由メモ",
          understood_at: null,
        },
      ],
      [{ contentId: 10, requirementKey: "keep" }]
    );

    expect(orphans.map((note) => note.requirement_key)).toEqual(["old", "understood_only"]);
  });
});
