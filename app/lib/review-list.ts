import { asReviewJson } from "@/app/lib/grading";
import type { RequirementStatus, ReviewJson, ScoreKind } from "@/app/types";

/** Completed AI reviews that may contribute review-list items. */
export type ReviewListSourceReview = {
  id: number;
  contentId: number;
  scoreKind: ScoreKind;
  /** Raw JSON from the DB; narrowed with asReviewJson(). */
  reviewJson: unknown;
  /** ISO timestamp used for chronological order (newer wins). */
  reviewedAt: string;
};

export type DerivedReviewItem = {
  contentId: number;
  requirementKey: string;
  /**
   * Set for estimated-derived items (identity includes the review that invented the key). Null for
   * rubric items, which are keyed only by (contentId, requirementKey).
   */
  reviewId: number | null;
  requirementName: string;
  comment: string;
  status: Extract<RequirementStatus, "partial" | "unmet">;
  overcome: boolean;
  scoreKind: "rubric" | "estimated";
};

type ItemIdentity = string;

function rubricIdentity(contentId: number, key: string): ItemIdentity {
  return `rubric:${contentId}:${key}`;
}

function estimatedIdentity(contentId: number, reviewId: number, key: string): ItemIdentity {
  return `estimated:${contentId}:${reviewId}:${key}`;
}

function isReviewableKind(scoreKind: ScoreKind): scoreKind is "rubric" | "estimated" {
  return scoreKind === "rubric" || scoreKind === "estimated";
}

function compareReviews(a: ReviewListSourceReview, b: ReviewListSourceReview): number {
  const timeCompare = a.reviewedAt.localeCompare(b.reviewedAt);
  if (timeCompare !== 0) return timeCompare;
  return a.id - b.id;
}

/**
 * Derives review-list items from the learner's completed AI reviews. Pure: no I/O, no table copy.
 * Rules (issue #309):
 * - Only score_kind rubric / estimated with a recognisable review_json contribute.
 * - An item opens on partial / unmet; overcomes when a newer review marks the same (contentId, key)
 *   as met, or (rubric only) the key disappears after a rubric_version change.
 * - Estimated items use (contentId, reviewId, key). When any rubric review exists for the content,
 *   estimated-derived items are omitted entirely.
 * - legacy / none / incomplete never contribute.
 */
export function deriveReviewListItems(reviews: ReviewListSourceReview[]): DerivedReviewItem[] {
  const usable = reviews
    .filter((review) => isReviewableKind(review.scoreKind))
    .map((review) => {
      const reviewJson = asReviewJson(review.reviewJson);
      return reviewJson ? { ...review, reviewJson } : null;
    })
    .filter((review): review is ReviewListSourceReview & { reviewJson: ReviewJson } =>
      Boolean(review)
    )
    .sort(compareReviews);

  const contentsWithRubric = new Set<number>();
  for (const review of usable) {
    if (review.scoreKind === "rubric") {
      contentsWithRubric.add(review.contentId);
    }
  }

  const items = new Map<ItemIdentity, DerivedReviewItem>();

  for (const review of usable) {
    if (review.scoreKind === "estimated" && contentsWithRubric.has(review.contentId)) {
      continue;
    }

    const keysInReview = new Set(
      review.reviewJson.requirements.map((requirement) => requirement.key)
    );

    for (const requirement of review.reviewJson.requirements) {
      const identity =
        review.scoreKind === "rubric"
          ? rubricIdentity(review.contentId, requirement.key)
          : estimatedIdentity(review.contentId, review.id, requirement.key);

      if (requirement.status === "partial" || requirement.status === "unmet") {
        items.set(identity, {
          contentId: review.contentId,
          requirementKey: requirement.key,
          reviewId: review.scoreKind === "estimated" ? review.id : null,
          requirementName: requirement.name ?? requirement.key,
          comment: requirement.comment,
          status: requirement.status,
          overcome: false,
          scoreKind: review.scoreKind,
        });
        continue;
      }

      if (requirement.status === "met") {
        // Overcome every open item for this (contentId, key), including estimated ones that share
        // the key across reviews.
        for (const [id, item] of items) {
          if (item.contentId === review.contentId && item.requirementKey === requirement.key) {
            items.set(id, { ...item, overcome: true });
          }
        }
      }
    }

    // Rubric version change: a key that was open but is gone from this newer rubric is overcome.
    if (review.scoreKind === "rubric") {
      for (const [id, item] of items) {
        if (
          item.contentId === review.contentId &&
          item.scoreKind === "rubric" &&
          !item.overcome &&
          !keysInReview.has(item.requirementKey)
        ) {
          items.set(id, { ...item, overcome: true });
        }
      }
    }
  }

  // Drop estimated leftovers if a rubric review exists for the content (defensive; the loop already
  // skips creating them once a rubric is known for the content).
  return [...items.values()].filter(
    (item) => !(item.scoreKind === "estimated" && contentsWithRubric.has(item.contentId))
  );
}

/** Count of items still open (not overcome by a later met / disappeared key). */
export function countUnovercomeReviewItems(items: readonly DerivedReviewItem[]): number {
  return items.reduce((sum, item) => sum + (item.overcome ? 0 : 1), 0);
}

/**
 * Sort by learning order (theme → content), then requirement key. Unknown contentIds sort last.
 * `contentOrder` maps contentId → rank (0-based).
 */
export function sortReviewItemsByLearningOrder<T extends { contentId: number; requirementKey: string }>(
  items: readonly T[],
  contentOrder: ReadonlyMap<number, number>
): T[] {
  return [...items].sort((a, b) => {
    const orderA = contentOrder.get(a.contentId);
    const orderB = contentOrder.get(b.contentId);
    if (orderA === undefined && orderB === undefined) {
      const contentCompare = a.contentId - b.contentId;
      if (contentCompare !== 0) return contentCompare;
      return a.requirementKey.localeCompare(b.requirementKey);
    }
    if (orderA === undefined) return 1;
    if (orderB === undefined) return -1;
    if (orderA !== orderB) return orderA - orderB;
    return a.requirementKey.localeCompare(b.requirementKey);
  });
}
