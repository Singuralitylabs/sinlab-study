"use client";

import { Bot, Loader2, TriangleAlert } from "lucide-react";
import { type PassDisplay, resolvePassDisplay, SCORE_KIND_BADGE_LABELS } from "@/app/lib/grading";
import type { AIReviewListItem, ScoreKind } from "@/app/types";
import { Badge } from "@/components/ui/badge";

/** Score badge shared by list and detail (thresholds 50/70 kept in one place). */
export function ScoreBadge({ score }: { score: number }) {
  let variant: "default" | "secondary" | "destructive" = "default";
  if (score < 50) {
    variant = "destructive";
  } else if (score < 70) {
    variant = "secondary";
  }

  return (
    <Badge variant={variant} className="text-sm">
      {score}/100
    </Badge>
  );
}

/** "参考" (estimated) / "採点対象外" (none); nothing for rubric and legacy. */
export function ScoreKindBadge({ scoreKind }: { scoreKind: ScoreKind }) {
  const label = SCORE_KIND_BADGE_LABELS[scoreKind];
  if (!label) {
    return null;
  }
  return (
    <Badge variant="outline" className="text-xs">
      {label}
    </Badge>
  );
}

export function PassBadge({ passDisplay }: { passDisplay: PassDisplay | null }) {
  if (!passDisplay) {
    return null;
  }
  return passDisplay === "passed" ? (
    <Badge variant="default" className="text-xs">
      合格
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-xs">
      再挑戦
    </Badge>
  );
}

export function AIReviewStatusBadge({ review }: { review: AIReviewListItem | null }) {
  if (!review) return null;

  switch (review.status) {
    case "completed":
      return (
        // Nowrap badges are min-content; without wrapping they widen a 320px card.
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          <Badge variant="default" className="gap-1">
            <Bot className="h-3 w-3" />
            レビュー済み
          </Badge>
          {review.overall_score != null && <ScoreBadge score={review.overall_score} />}
          <ScoreKindBadge scoreKind={review.score_kind} />
          <PassBadge passDisplay={resolvePassDisplay(review)} />
        </div>
      );
    case "processing":
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          レビュー中
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <TriangleAlert className="h-3 w-3" />
          レビュー失敗
        </Badge>
      );
    default:
      return null;
  }
}
