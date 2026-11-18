"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { HtmlPreviewNoSSR } from "@/app/components/HtmlPreviewNoSSR";
import type { PlaygroundKind } from "@/app/constants/playground";
import { resolvePreviewDisplay } from "@/app/lib/html-preview";
import {
  defaultPlaygroundPreviewPage,
  type PlaygroundFileInput,
  playgroundHtmlPages,
  selectPlaygroundPreviewPage,
  toPlaygroundCodeFiles,
} from "@/app/lib/playground";
import { Button } from "@/components/ui/button";

const panelLoading = () => <p className="text-sm text-muted-foreground">読み込み中...</p>;

// Each kind's panel is its own chunk: opening Web / Python / SQL must not download the terminal or
// the JSON / YAML checker, and vice versa (#583: this page is a side feature and stays light).
const PlaygroundMarkdownPanel = dynamic(
  () => import("./PlaygroundMarkdownPanel").then((m) => m.PlaygroundMarkdownPanel),
  { ssr: false, loading: panelLoading }
);
const PlaygroundDataPanel = dynamic(
  () => import("./PlaygroundDataPanel").then((m) => m.PlaygroundDataPanel),
  { ssr: false, loading: panelLoading }
);
const PlaygroundTerminal = dynamic(
  () => import("./PlaygroundTerminal").then((m) => m.PlaygroundTerminal),
  { ssr: false, loading: panelLoading }
);

/** How added files take part in a run; without it, a new file that does nothing looks broken. */
const RUN_HINTS: Record<PlaygroundKind, string> = {
  web: "プレビューには選んだ HTML（ふだんは index.html）を表示します。追加した .js / .css は、HTML の script タグの src や link タグの href にファイル名を書くと読み込まれます。",
  python:
    "main.py を実行します（無ければ左端のファイル）。追加した .py は、main.py から import すると使えます。",
  sql: "すべての .sql ファイルを、左のタブの順に続けて実行します。",
  markdown:
    "README.md（無ければ左端のファイル）を表示します。ファイルが2つ以上あるときは、上で切り替えられます。",
  json: "すべての .json ファイルについて、正しく書けているかを確かめ、整えた形で表示します。",
  yaml: "すべての .yaml / .yml ファイルについて、正しく書けているかを確かめ、同じ内容を JSON で表示します。",
  terminal:
    "左のファイルは、ホーム（~）に置かれます。ターミナルでの変更は左のファイルには反映されず、左のファイルを直したときは「やり直す」で読み込み直します。",
};

/**
 * Same runners and the same sandbox as exercises (HtmlPreview): nothing here may loosen them,
 * since the code is whatever the visitor typed or a shared link handed them.
 */
export function PlaygroundRunPanel(props: {
  kind: PlaygroundKind;
  files: readonly PlaygroundFileInput[];
  /** Tailwind height class for the preview frame (exercises use 360px). */
  frameHeightClassName?: string;
}) {
  const { kind, files, frameHeightClassName } = props;
  const hint = <p className="text-xs text-muted-foreground">{RUN_HINTS[kind]}</p>;
  // Each kind mounts only its own panel, so opening one never loads another's code (#583).
  switch (kind) {
    case "markdown":
      return (
        <div className="space-y-2">
          <PlaygroundMarkdownPanel files={files} heightClassName={frameHeightClassName} />
          {hint}
        </div>
      );
    case "json":
    case "yaml":
      return (
        <div className="space-y-2">
          <PlaygroundDataPanel kind={kind} files={files} heightClassName={frameHeightClassName} />
          {hint}
        </div>
      );
    case "terminal":
      return (
        <div className="space-y-2">
          <PlaygroundTerminal files={files} heightClassName={frameHeightClassName} />
          {hint}
        </div>
      );
    default:
      return <PlaygroundCodeRunPanel {...props} kind={kind} />;
  }
}

function PlaygroundCodeRunPanel({
  kind,
  files,
  frameHeightClassName,
}: {
  kind: "web" | "python" | "sql";
  files: readonly PlaygroundFileInput[];
  frameHeightClassName?: string;
}) {
  const codeFiles = useMemo(() => toPlaygroundCodeFiles(kind, files), [kind, files]);
  const [chosenPage, setChosenPage] = useState<string | null>(null);
  const pages = kind === "web" ? playgroundHtmlPages(codeFiles) : [];
  const page = chosenPage && pages.includes(chosenPage) ? chosenPage : null;
  const shownPage = page ?? defaultPlaygroundPreviewPage(codeFiles);
  const runFiles = selectPlaygroundPreviewPage(codeFiles, page);
  const display = resolvePreviewDisplay({ files: runFiles });

  const hint = <p className="text-xs text-muted-foreground">{RUN_HINTS[kind]}</p>;

  if (!display.preview && !display.console) {
    return (
      <div className="space-y-2">
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          HTML ファイル（.html）か JavaScript ファイル（.js）を追加すると、ここで動かせます。
        </p>
        {hint}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {pages.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">表示するページ</legend>
          <span className="mr-1 text-xs text-muted-foreground" aria-hidden="true">
            表示するページ:
          </span>
          {pages.map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={name === shownPage ? "default" : "outline"}
              aria-pressed={name === shownPage}
              className="h-7 font-mono text-xs"
              onClick={() => setChosenPage(name)}
            >
              {name}
            </Button>
          ))}
        </fieldset>
      )}
      <HtmlPreviewNoSSR
        // A kind switch changes the runner (iframe / Pyodide / PGlite); start it fresh.
        key={kind}
        files={runFiles}
        showPreviewFrame={display.preview}
        showConsolePanel={display.console}
        frameHeightClassName={frameHeightClassName}
      />
      {hint}
    </div>
  );
}
