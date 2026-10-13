"use client";

import dynamic from "next/dynamic";

// Loaded only when a previewable exercise or submission is shown, so other pages never pay for it
// (same approach as CodeEditorNoSSR; see docs/specification.md 5.4.6).
export const HtmlPreviewNoSSR = dynamic(
  () => import("@/app/components/HtmlPreview").then((m) => m.HtmlPreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-md border border-input bg-muted/30 text-sm text-muted-foreground min-h-[120px]">
        プレビューを読み込み中...
      </div>
    ),
  }
);
