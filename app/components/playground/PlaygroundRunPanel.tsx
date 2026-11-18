"use client";

import { useMemo } from "react";
import { HtmlPreviewNoSSR } from "@/app/components/HtmlPreviewNoSSR";
import type { PlaygroundKind } from "@/app/constants/playground";
import { resolvePreviewDisplay } from "@/app/lib/html-preview";
import { type PlaygroundFileInput, toPlaygroundCodeFiles } from "@/app/lib/playground";

/**
 * Same runners and the same sandbox as exercises (HtmlPreview): nothing here may loosen them,
 * since the code is whatever the visitor typed or a shared link handed them.
 */
export function PlaygroundRunPanel({
  kind,
  files,
}: {
  kind: PlaygroundKind;
  files: readonly PlaygroundFileInput[];
}) {
  const codeFiles = useMemo(() => toPlaygroundCodeFiles(kind, files), [kind, files]);
  const display = resolvePreviewDisplay({ files: codeFiles });

  if (!display.preview && !display.console) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        HTML ファイル（.html）か JavaScript ファイル（.js）を追加すると、ここで動かせます。
      </p>
    );
  }
  return (
    <HtmlPreviewNoSSR
      // A kind switch changes the runner (iframe / Pyodide / PGlite); start it fresh.
      key={kind}
      files={codeFiles}
      showPreviewFrame={display.preview}
      showConsolePanel={display.console}
    />
  );
}
