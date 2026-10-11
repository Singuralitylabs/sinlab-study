"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// pdfjs-dist uses browser APIs such as DOMMatrix in Node.js, so SSR is impossible: set ssr: false
// in a "use client" file to make it client-only. The loading height (h-64) matches PdfSlideViewer's
// isLoading display to prevent layout shift.
export const PdfSlideViewerNoSSR = dynamic(
  () => import("@/app/components/PdfSlideViewer").then((m) => m.PdfSlideViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-10 w-full max-w-sm rounded-lg border" />
        <div className="relative w-full overflow-hidden rounded-lg border bg-muted/30">
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            スライドを読み込み中...
          </div>
        </div>
      </div>
    ),
  }
);
