"use client";

import type { AIReviewListItem } from "@/app/types";
import { AIReviewDisplayNoSSR } from "./AIReviewDisplayNoSSR";

interface AIReviewDisplayClientProps {
  review: AIReviewListItem;
}

export function AIReviewDisplayClient({ review }: AIReviewDisplayClientProps) {
  return <AIReviewDisplayNoSSR review={review} defaultExpanded={false} />;
}
