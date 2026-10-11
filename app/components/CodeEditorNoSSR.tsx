"use client";

import dynamic from "next/dynamic";
import type { CodeEditorProps } from "@/app/components/CodeEditor";

// The CodeMirror bundle (@uiw/react-codemirror + language packages) is hundreds of KB, so lazy-load
// it to keep it out of the exercise page's initial load (same approach as PdfSlideViewerNoSSR).
// There is no way to enter a value while loading, so no input is lost and the submit form's empty
// check (isCodeValid) works as usual. The placeholder height (200px) must match CodeEditor's fixed
// height (next/dynamic's loading can't receive the component's props, so CodeEditor is also fixed
// at 200px).
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
