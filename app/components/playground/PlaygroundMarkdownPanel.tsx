"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { PlaygroundFileInput } from "@/app/lib/playground";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The article renderer (react-markdown + highlighting) loads only when the Markdown kind is shown.
// It never renders raw HTML, so a template cannot inject markup into the page.
const MarkdownRenderer = dynamic(
  () => import("@/app/components/MarkdownRenderer").then((m) => m.MarkdownRenderer),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">読み込み中...</p>,
  }
);

/** Shows README.md (else the first file); a picker switches when there are several. */
export function PlaygroundMarkdownPanel({
  files,
  heightClassName,
}: {
  files: readonly PlaygroundFileInput[];
  heightClassName?: string;
}) {
  const names = files.map((file) => file.filename.trim());
  const [chosen, setChosen] = useState<string | null>(null);
  const shown =
    (chosen && names.includes(chosen) ? chosen : null) ??
    names.find((name) => name.toLowerCase() === "readme.md") ??
    names[0];
  const content = files.find((file) => file.filename.trim() === shown)?.content ?? "";

  return (
    <div className="space-y-2">
      {names.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">表示するファイル</legend>
          <span className="mr-1 text-xs text-muted-foreground" aria-hidden="true">
            表示するファイル:
          </span>
          {names.map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={name === shown ? "default" : "outline"}
              aria-pressed={name === shown}
              className="h-7 font-mono text-xs"
              onClick={() => setChosen(name)}
            >
              {name}
            </Button>
          ))}
        </fieldset>
      )}
      <div className={cn("overflow-y-auto rounded-md border p-4", heightClassName ?? "h-[360px]")}>
        {content.trim() ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="text-sm text-muted-foreground">中身が空です。</p>
        )}
      </div>
    </div>
  );
}
