"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIReviewDisplayProps } from "./AIReviewDisplay";

// Lazy-load AIReviewDisplay (which pulls in MarkdownRenderer: react-markdown + lowlight +
// highlight.js) only when a review is shown, keeping it out of First Load JS for pages without
// reviews such as video/text/slide (same approach as CodeEditorNoSSR / PdfSlideViewerNoSSR).
const AIReviewDisplayDynamic = dynamic<AIReviewDisplayProps>(
  () => import("@/app/components/AIReviewDisplay").then((m) => m.AIReviewDisplay),
  {
    ssr: false,
    // Match the collapsed header's height (p-4 + icon row) to limit layout shift.
    loading: () => (
      <div className="mt-4 border rounded-lg overflow-hidden">
        <div className="w-full p-4 flex items-center gap-2 bg-muted/30">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
    ),
  }
);

/**
 * Thin wrapper mounting the dynamic chunk only for review/loading, so callers can mount it
 * unconditionally without adding the Markdown highlighter to First Load.
 */
export function AIReviewDisplayNoSSR(props: AIReviewDisplayProps) {
  if (!props.review && !props.isLoading) {
    return null;
  }
  return <AIReviewDisplayDynamic {...props} />;
}
