"use client";

import dynamic from "next/dynamic";

// pdfjs-dist は Node.js 環境で DOMMatrix 等のブラウザAPIを使うため SSR 不可
// "use client" ファイル内で ssr: false を指定してクライアント専用にする
export const PdfSlideViewerNoSSR = dynamic(
  () => import("@/app/components/PdfSlideViewer").then((m) => m.PdfSlideViewer),
  { ssr: false }
);
