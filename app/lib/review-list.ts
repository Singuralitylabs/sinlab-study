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
   * Latest estimated review that set this open item's status/comment. Null for rubric items
   * (identity is only (contentId, requirementKey) for both kinds).
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

function estimatedIdentity(contentId: number, key: string): ItemIdentity {
  return `estimated:${contentId}:${key}`;
}

function isReviewableKind(scoreKind: ScoreKind): scoreKind is "rubric" | "estimated" {
  return scoreKind === "rubric" || scoreKind === "estimated";
}

function compareReviews(a: ReviewListSourceReview, b: ReviewListSourceReview): number {
  const timeCompare = a.reviewedAt.localeCompare(b.reviewedAt);
  if (timeCompare !== 0) return timeCompare;
  return a.id - b.id;
}

type UsableReview = ReviewListSourceReview & { reviewJson: ReviewJson };

/**
 * Shared filter → parse → drop-null → sort for review-list derivation and orphan name lookup.
 * Call once per request when both deriveReviewListItems and buildRequirementNameByContentKey are needed.
 */
export function toUsableReviews(reviews: readonly ReviewListSourceReview[]): UsableReview[] {
  return reviews
    .filter((review) => isReviewableKind(review.scoreKind))
    .map((review) => {
      const reviewJson = asReviewJson(review.reviewJson);
      return reviewJson ? { ...review, reviewJson } : null;
    })
    .filter((review): review is UsableReview => Boolean(review))
    .sort(compareReviews);
}

function deriveReviewListItemsFromUsable(usable: readonly UsableReview[]): DerivedReviewItem[] {
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
      const scoreKind = review.scoreKind === "estimated" ? "estimated" : "rubric";
      const identity =
        scoreKind === "rubric"
          ? rubricIdentity(review.contentId, requirement.key)
          : estimatedIdentity(review.contentId, requirement.key);

      if (requirement.status === "partial" || requirement.status === "unmet") {
        items.set(identity, {
          contentId: review.contentId,
          requirementKey: requirement.key,
          reviewId: scoreKind === "estimated" ? review.id : null,
          requirementName: requirement.name ?? requirement.key,
          comment: requirement.comment,
          status: requirement.status,
          overcome: false,
          scoreKind,
        });
        continue;
      }

      if (requirement.status === "met") {
        // Newer estimated or rubric can mark the same (contentId, key) met.
        for (const [id, item] of items) {
          if (item.contentId === review.contentId && item.requirementKey === requirement.key) {
            items.set(id, { ...item, overcome: true });
          }
        }
      }
    }

    if (review.scoreKind === "rubric") {
      // Key gone from a newer rubric review: overcome (rubric version change).
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
    } else {
      // Estimated: drop open items not from this (latest) estimated review. Missing keys are
      // replaced, not overcome — treating disappearances as overcome falsely clears the list
      // whenever the AI renames keys on resubmit.
      for (const [id, item] of items) {
        if (
          item.contentId === review.contentId &&
          item.scoreKind === "estimated" &&
          !item.overcome &&
          item.reviewId !== review.id
        ) {
          items.delete(id);
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

/**
 * Derives review-list items from the learner's completed AI reviews. Pure: no I/O, no table copy.
 * Rules (issue #309):
 * - Only score_kind rubric / estimated with a recognisable review_json contribute.
 * - Rubric: opens on partial / unmet; overcomes when a newer review marks the same (contentId, key)
 *   as met, or the key disappears from a newer rubric review (version change).
 * - Estimated: only the latest estimated review per content contributes open items (older open
 *   estimated items are replaced, not overcome — AI keys rename freely). Overcome only when a
 *   newer review (estimated or rubric) marks the same key met, or when a rubric review exists and
 *   estimated items are hidden.
 * - Identity is (contentId, key) for both kinds. When any rubric review exists for the content,
 *   estimated-derived items are omitted entirely.
 * - legacy / none / incomplete never contribute.
 */
export function deriveReviewListItems(
  reviews: readonly ReviewListSourceReview[]
): DerivedReviewItem[] {
  return deriveReviewListItemsFromUsable(toUsableReviews(reviews));
}

/** Count of items still open (not overcome by a later met / disappeared key). */
export function countUnovercomeReviewItems(items: readonly DerivedReviewItem[]): number {
  return items.reduce((sum, item) => sum + (item.overcome ? 0 : 1), 0);
}

/**
 * Drop items whose content is not in the published/visible set (same filter as the review-list
 * page). Counts that skip this diverge from the list when content is unpublished or deleted.
 */
export function filterReviewItemsToVisibleContents<T extends { contentId: number }>(
  items: readonly T[],
  visibleContentIds: ReadonlySet<number>
): T[] {
  return items.filter((item) => visibleContentIds.has(item.contentId));
}

/**
 * Home / badge count from already-fetched reviews + visible content IDs (same filter as the list).
 * Keeps derive → filter → count in one place so page.tsx does not re-inline the pipeline.
 */
export function countVisibleUnovercome(
  reviews: readonly ReviewListSourceReview[],
  visibleContentIds: ReadonlySet<number>
): number {
  return countUnovercomeReviewItems(
    filterReviewItemsToVisibleContents(deriveReviewListItems(reviews), visibleContentIds)
  );
}

function buildRequirementNameByContentKeyFromUsable(
  usable: readonly UsableReview[]
): Map<string, string> {
  const names = new Map<string, string>();
  for (const review of usable) {
    for (const requirement of review.reviewJson.requirements) {
      const name = requirement.name?.trim() || requirement.key;
      names.set(`${review.contentId}:${requirement.key}`, name);
    }
  }
  return names;
}

/**
 * Latest known requirement display name per (contentId, key) across all usable reviews.
 * Used for orphan memos after estimated key rename — keys alone are AI ids, not learner-facing.
 */
export function buildRequirementNameByContentKey(
  reviews: readonly ReviewListSourceReview[]
): Map<string, string> {
  return buildRequirementNameByContentKeyFromUsable(toUsableReviews(reviews));
}

/**
 * One parse/sort for the list page that needs both derived items and orphan requirement names.
 */
export function deriveReviewListWithRequirementNames(reviews: readonly ReviewListSourceReview[]): {
  items: DerivedReviewItem[];
  requirementNames: Map<string, string>;
} {
  const usable = toUsableReviews(reviews);
  return {
    items: deriveReviewListItemsFromUsable(usable),
    requirementNames: buildRequirementNameByContentKeyFromUsable(usable),
  };
}

/**
 * Notes keyed to a requirement that is no longer in the derived open/overcome set (e.g. estimated
 * key renamed on resubmit). Rows stay in DB; the list surfaces them so memos are not stranded.
 * Only notes with non-empty memo text (matches UI copy: written memos remain).
 */
export function findOrphanRequirementNotes<
  T extends {
    content_id: number;
    requirement_key: string | null;
    memo: string | null;
    understood_at: string | null;
  },
>(
  notes: readonly T[],
  activeItems: readonly { contentId: number; requirementKey: string }[]
): Array<T & { requirement_key: string; memo: string }> {
  const activeKeys = new Set(activeItems.map((item) => `${item.contentId}:${item.requirementKey}`));
  return notes.filter((note): note is T & { requirement_key: string; memo: string } => {
    if (note.requirement_key === null) return false;
    if (activeKeys.has(`${note.content_id}:${note.requirement_key}`)) return false;
    return note.memo != null && note.memo.trim() !== "";
  });
}

/**
 * Sort by learning order (theme → content), then requirement key. Unknown contentIds sort last.
 * `contentOrder` maps contentId → rank (0-based).
 */
export function sortReviewItemsByLearningOrder<
  T extends { contentId: number; requirementKey: string },
>(items: readonly T[], contentOrder: ReadonlyMap<number, number>): T[] {
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
