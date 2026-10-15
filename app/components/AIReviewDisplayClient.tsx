"use client";

import type { AIReviewListItem } from "@/app/types";
import { AIReviewDisplayNoSSR } from "./AIReviewDisplayNoSSR";

interface AIReviewDisplayClientProps {
  review: AIReviewListItem;
  contentId?: number;
  memosByKey?: Readonly<Record<string, string | null>>;
}

export function AIReviewDisplayClient({
  review,
  contentId,
  memosByKey,
}: AIReviewDisplayClientProps) {
  return (
    <AIReviewDisplayNoSSR
      review={review}
      defaultExpanded={false}
      contentId={contentId}
      memosByKey={memosByKey}
    />
  );
}
