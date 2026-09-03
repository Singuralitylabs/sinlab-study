"use client";

import dynamic from "next/dynamic";
import type { CodeEditorProps } from "@/app/components/CodeEditor";

// CodeMirror一式（@uiw/react-codemirror + 各言語パッケージ）は数百KB規模のため、
// 演習ページの初期ロードから切り離すために遅延読み込みする（PdfSlideViewerNoSSR と同方式）。
// 読み込み完了までは value が空のプレースホルダーが表示され、
// 実際の入力欄がまだ存在しないため提出フォーム側のバリデーションで送信も抑止される。
export const CodeEditorNoSSR = dynamic<CodeEditorProps>(
  () => import("@/app/components/CodeEditor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-md border border-input bg-muted/30 text-sm text-muted-foreground min-h-[200px]">
        エディタを読み込み中...
      </div>
    ),
  }
);
