"use client";

import dynamic from "next/dynamic";
import type { CodeEditorProps } from "@/app/components/CodeEditor";

// CodeMirror一式（@uiw/react-codemirror + 各言語パッケージ）は数百KB規模のため、
// 演習ページの初期ロードから切り離すために遅延読み込みする（PdfSlideViewerNoSSR と同方式）。
// 読み込み中は value を入力する手段が無いため入力値は失われず、
// 提出フォーム側の空文字チェック（isCodeValid）は通常どおり機能する。
// 次のプレースホルダーの高さ（200px）は CodeEditor 側の固定高さと一致させている
// （next/dynamic の loading はコンポーネント本体のpropsを受け取れないため、
// 両者がズレないよう CodeEditor 側も 200px 固定にしている）。
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
