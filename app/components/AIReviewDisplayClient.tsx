"use client";

import type { AIReviewListItem } from "@/app/types";
import { AIReviewDisplay } from "./AIReviewDisplay";

interface AIReviewDisplayClientProps {
  review: AIReviewListItem;
}

export function AIReviewDisplayClient({ review }: AIReviewDisplayClientProps) {
  return <AIReviewDisplay review={review} defaultExpanded={false} />;
}
