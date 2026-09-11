"use client";

import dynamic from "next/dynamic";
import type { AIReviewDisplayProps } from "./AIReviewDisplay";

// MarkdownRenderer（react-markdown + lowlight + highlight.js）を含む AIReviewDisplay を
// レビュー表示時のみ遅延読み込みする。video / text / slide などレビューが無いページの
// First Load JS から切り離す（CodeEditorNoSSR / PdfSlideViewerNoSSR と同方式）。
export const AIReviewDisplayNoSSR = dynamic<AIReviewDisplayProps>(
  () => import("@/app/components/AIReviewDisplay").then((m) => m.AIReviewDisplay),
  {
    ssr: false,
    loading: () => (
      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      </div>
    ),
  }
);
