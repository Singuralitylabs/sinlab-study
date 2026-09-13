"use client";

import { Bot, Loader2, TriangleAlert } from "lucide-react";
import type { AIReviewListItem } from "@/app/types";
import { Badge } from "@/components/ui/badge";

/** 一覧・詳細で共有するスコアバッジ（閾値 50/70 を一箇所に集約）。 */
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

export function AIReviewStatusBadge({ review }: { review: AIReviewListItem | null }) {
  if (!review) return null;

  switch (review.status) {
    case "completed":
      return (
        <div className="flex items-center gap-1.5">
          <Badge variant="default" className="gap-1">
            <Bot className="h-3 w-3" />
            レビュー済み
          </Badge>
          {review.overall_score != null && <ScoreBadge score={review.overall_score} />}
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
