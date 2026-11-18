"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PlaygroundFileInput } from "@/app/lib/playground";
import { checkJson, checkYaml, type DataCheckResult } from "@/app/lib/playground-data";
import { cn } from "@/lib/utils";

type YamlModule = { load: (text: string) => unknown };

/** JSON / YAML: checks each file and shows the parsed value as formatted JSON. */
export function PlaygroundDataPanel({
  kind,
  files,
  heightClassName,
}: {
  kind: "json" | "yaml";
  files: readonly PlaygroundFileInput[];
  heightClassName?: string;
}) {
  // js-yaml (~40KB) loads only when the YAML kind is opened; JSON needs nothing beyond the browser.
  const [yaml, setYaml] = useState<YamlModule | null>(null);
  const [yamlError, setYamlError] = useState(false);
  useEffect(() => {
    if (kind !== "yaml") {
      return;
    }
    let cancelled = false;
    import("js-yaml")
      .then((module) => {
        if (!cancelled) setYaml({ load: module.load });
      })
      .catch(() => {
        if (!cancelled) setYamlError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const results = useMemo(
    () =>
      files.map((file) => ({
        filename: file.filename.trim(),
        result:
          kind === "json" ? checkJson(file.content) : yaml ? checkYaml(yaml, file.content) : null,
      })),
    [files, kind, yaml]
  );

  if (yamlError) {
    return (
      <p className="text-sm text-destructive">
        YAML を読む部品を読み込めませんでした。ページを再読み込みしてください。
      </p>
    );
  }
  return (
    <div className={cn("space-y-4 overflow-y-auto", heightClassName ?? "max-h-[360px]")}>
      {results.map(({ filename, result }) => (
        <section key={filename} className="space-y-2" aria-label={filename}>
          <h3 className="font-mono text-sm font-medium">{filename}</h3>
          {result ? (
            <DataResult result={result} kind={kind} />
          ) : (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          )}
        </section>
      ))}
    </div>
  );
}

function DataResult({ result, kind }: { result: DataCheckResult; kind: "json" | "yaml" }) {
  const label = kind === "json" ? "JSON" : "YAML";
  if (!result.ok) {
    const where =
      result.line !== null
        ? `（${result.line} 行目${result.column !== null ? ` ${result.column} 文字目` : ""}付近）`
        : "";
    return (
      <div className="rounded-md border border-destructive/50 p-3 text-sm" role="status">
        <p className="flex items-center gap-1 font-medium text-destructive">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {label} の書き方に誤りがあります{where}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{result.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p
        className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400"
        role="status"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        正しい {label} です。全体は{result.summary}です。
      </p>
      {kind === "yaml" && (
        <p className="text-xs text-muted-foreground">
          同じ内容を JSON で表すと、次のようになります。
        </p>
      )}
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
        {result.pretty}
      </pre>
    </div>
  );
}
