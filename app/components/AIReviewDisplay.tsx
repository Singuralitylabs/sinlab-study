"use client";

import { Bot, ChevronDown, ChevronUp, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { asReviewJson, resolvePassDisplay } from "@/app/lib/grading";
import type { AIReviewListItem } from "@/app/types";
import { Button } from "@/components/ui/button";
import { PassBadge, ScoreBadge, ScoreKindBadge } from "./AIReviewStatusBadge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { StructuredReview } from "./StructuredReview";

export interface AIReviewDisplayProps {
  review: AIReviewListItem | null;
  isLoading?: boolean;
  onRetry?: () => void;
  defaultExpanded?: boolean;
  /** Enables review-list cues / memo fields on partial and unmet requirements. */
  contentId?: number;
  memosByKey?: Readonly<Record<string, string | null>>;
}

export function AIReviewDisplay({
  review,
  isLoading = false,
  onRetry,
  defaultExpanded = false,
  contentId,
  memosByKey,
}: AIReviewDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (isLoading) {
    return (
      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>AIレビューを生成中...</span>
        </div>
      </div>
    );
  }

  if (!review) {
    return null;
  }

  if (review.status === "failed") {
    return (
      <div className="mt-4 p-4 border border-destructive/50 rounded-lg bg-destructive/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            <span className="text-sm">
              AIレビューの生成に失敗しました
              {review.error_message ? `：${review.error_message}` : ""}
            </span>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-1" />
              再試行
            </Button>
          )}
        </div>
      </div>
    );
  }

  // processing / pending
  if (review.status === "processing" || review.status === "pending") {
    return (
      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>AIレビューを生成中...</span>
        </div>
      </div>
    );
  }

  // completed. legacy rows (and any row whose review_json is unrecognisable) keep rendering
  // review_content as before.
  const reviewJson =
    review.score_kind === "legacy" || review.score_kind === "incomplete"
      ? null
      : asReviewJson(review.review_json);
  const passDisplay = resolvePassDisplay(review);

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      <div className="w-full p-4 flex items-center justify-between bg-muted/30">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">AIレビュー</span>
          {review.overall_score != null && <ScoreBadge score={review.overall_score} />}
          <ScoreKindBadge scoreKind={review.score_kind} />
          <PassBadge passDisplay={passDisplay} />
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      {isExpanded && reviewJson && (
        <div className="p-4 border-t">
          <StructuredReview
            reviewJson={reviewJson}
            scoreKind={review.score_kind}
            passDisplay={passDisplay}
            contentId={contentId}
            memosByKey={memosByKey}
          />
        </div>
      )}
      {isExpanded && !reviewJson && review.review_content && (
        <div className="p-4 border-t">
          <MarkdownRenderer content={review.review_content} className="text-sm" />
        </div>
      )}
    </div>
  );
}
