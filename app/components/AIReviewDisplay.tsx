"use client";

import { Bot, ChevronDown, ChevronUp, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { AIReview } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface AIReviewDisplayProps {
  review: AIReview | null;
  isLoading?: boolean;
  onRetry?: () => void;
  defaultExpanded?: boolean;
}

function ScoreBadge({ score }: { score: number }) {
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

export function AIReviewDisplay({
  review,
  isLoading = false,
  onRetry,
  defaultExpanded = false,
}: AIReviewDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // ローディング中
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

  // レビューなし
  if (!review) {
    return null;
  }

  // 失敗
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

  // completed
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
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isExpanded && review.review_content && (
        <div className="p-4 border-t">
          <MarkdownRenderer content={review.review_content} className="text-sm" />
        </div>
      )}
    </div>
  );
}

export function AIReviewStatusBadge({ review }: { review: AIReview | null }) {
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
