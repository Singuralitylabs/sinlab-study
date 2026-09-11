"use client";

import dynamic from "next/dynamic";

// pdfjs-dist は Node.js 環境で DOMMatrix 等のブラウザAPIを使うため SSR 不可
// "use client" ファイル内で ssr: false を指定してクライアント専用にする
// loading の高さ（h-64）は PdfSlideViewer の isLoading 表示と揃えてレイアウトシフトを防ぐ
export const PdfSlideViewerNoSSR = dynamic(
  () => import("@/app/components/PdfSlideViewer").then((m) => m.PdfSlideViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-full max-w-sm animate-pulse rounded-lg border bg-muted/50" />
        <div className="relative w-full overflow-hidden rounded-lg border bg-muted/30">
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            スライドを読み込み中...
          </div>
        </div>
      </div>
    ),
  }
);
