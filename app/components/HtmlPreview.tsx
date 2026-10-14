"use client";

import { Eye, EyeOff, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreviewDocument } from "@/app/lib/html-preview";
import {
  acceptPreviewConsoleMessage,
  injectPreviewConsoleBridge,
  PREVIEW_CONSOLE_MAX_ENTRIES,
  type PreviewConsoleEntry,
} from "@/app/lib/preview-console";
import type { CodeFile } from "@/app/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HtmlPreviewProps {
  files: CodeFile[];
  /** History lists mount many previews, so they start collapsed to avoid running every script. */
  collapsible?: boolean;
}

const DEBOUNCE_MS = 300;

interface ConsoleLog {
  run: number;
  entries: PreviewConsoleEntry[];
  truncated: boolean;
}

const LEVEL_CLASS: Record<PreviewConsoleEntry["level"], string> = {
  log: "text-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
};

export function HtmlPreview({ files, collapsible = false }: HtmlPreviewProps) {
  const [open, setOpen] = useState(!collapsible);
  const [reloadKey, setReloadKey] = useState(0);
  // Callers pass a fresh array every render; keying on the serialized content keeps the debounce
  // from restarting (and the document from being rebuilt) when nothing changed.
  const signature = JSON.stringify(files);
  const [debouncedSignature, setDebouncedSignature] = useState(signature);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSignature(signature), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [signature]);

  const srcDoc = useMemo(
    () =>
      injectPreviewConsoleBridge(
        buildPreviewDocument(JSON.parse(debouncedSignature) as CodeFile[])
      ),
    [debouncedSignature]
  );

  const [showConsole, setShowConsole] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Every new document gets a new run (and a new iframe element via key), so output from the
  // previous document neither lingers in the list nor passes the event.source check.
  const runCounter = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the deps are the triggers of a new run.
  const run = useMemo(() => ++runCounter.current, [srcDoc, reloadKey, open]);
  const runRef = useRef(run);
  runRef.current = run;
  const [log, setLog] = useState<ConsoleLog>({ run, entries: [], truncated: false });
  const current = log.run === run ? log : { run, entries: [], truncated: false };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const entry = acceptPreviewConsoleMessage(event, iframeRef.current?.contentWindow);
      if (!entry) {
        return;
      }
      const activeRun = runRef.current;
      setLog((prev) => {
        const base =
          prev.run === activeRun ? prev : { run: activeRun, entries: [], truncated: false };
        if (base.entries.length >= PREVIEW_CONSOLE_MAX_ENTRIES) {
          return base.truncated ? base : { ...base, truncated: true };
        }
        return { ...base, entries: [...base.entries, entry] };
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">プレビュー</span>
        <div className="flex flex-wrap justify-end gap-2">
          {open && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={showConsole}
              onClick={() => setShowConsole((s) => !s)}
            >
              <Terminal className="h-4 w-4" />
              {showConsole ? "コンソールを隠す" : "コンソールを表示"}
            </Button>
          )}
          {open && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              再読み込み
            </Button>
          )}
          {collapsible && (
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
              {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {open ? "閉じる" : "プレビューを表示"}
            </Button>
          )}
        </div>
      </div>
      {open && (
        // allow-scripts lets the learner's JavaScript run (the point of the preview), unlike the
        // inert sandbox="" of the email template preview. allow-same-origin is deliberately absent:
        // it would give that script this origin's cookies, Supabase session and /api access.
        // Forms, popups, modals and top navigation stay off for the same reason.
        <iframe
          ref={iframeRef}
          key={run}
          title="プレビュー"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="h-[360px] w-full rounded-md border bg-white"
        />
      )}
      {open && showConsole && (
        <div className="rounded-md border bg-muted/30">
          <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">
            コンソール
          </div>
          {current.entries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              プログラムの出力（console）やエラーがここに表示されます
            </p>
          ) : (
            // Rendered as React text (textContent), never as HTML: the lines are the learner's.
            <ol className="max-h-60 overflow-y-auto px-3 py-2 font-mono text-xs">
              {current.entries.map((entry, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log; identical lines are common.
                  key={index}
                  className={cn("whitespace-pre-wrap break-all", LEVEL_CLASS[entry.level])}
                >
                  {entry.text}
                </li>
              ))}
              {current.truncated && (
                <li className="text-muted-foreground">
                  （{PREVIEW_CONSOLE_MAX_ENTRIES}件を超えた出力は省略しました）
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
