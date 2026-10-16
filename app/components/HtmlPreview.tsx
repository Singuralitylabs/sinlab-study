"use client";

import { Eye, EyeOff, Play, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildPreviewDocument } from "@/app/lib/html-preview";
import {
  acceptPreviewConsoleMessage,
  buildPreviewConsoleBridgeScript,
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
  /** Visible 360px frame. Off for a console-only exercise. */
  showPreviewFrame?: boolean;
  /** Console list. Off when the exercise turns the console off. */
  showConsolePanel?: boolean;
}

const DEBOUNCE_MS = 300;

const CONSOLE_BRIDGE = buildPreviewConsoleBridgeScript();

const LEVEL_CLASS: Record<PreviewConsoleEntry["level"], string> = {
  log: "text-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
};

export function HtmlPreview({
  files,
  collapsible = false,
  showPreviewFrame = true,
  showConsolePanel = true,
}: HtmlPreviewProps) {
  const manualRun = showConsolePanel && !showPreviewFrame;
  const [open, setOpen] = useState(!collapsible);
  const [consoleOpen, setConsoleOpen] = useState(true);
  // Callers pass a fresh array every render; keying on the serialized content keeps the debounce
  // from restarting (and the document from being rebuilt) when nothing changed.
  const signature = JSON.stringify(files);
  const [debouncedSignature, setDebouncedSignature] = useState(signature);
  // Console-only stays idle until 実行. Typing must not rebuild the document.
  const [manualDoc, setManualDoc] = useState<string | null>(null);
  const [manualRunId, setManualRunId] = useState(0);

  useEffect(() => {
    if (manualRun) {
      return;
    }
    const timer = setTimeout(() => setDebouncedSignature(signature), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [signature, manualRun]);

  const liveDoc = useMemo(
    () =>
      buildPreviewDocument(JSON.parse(debouncedSignature) as CodeFile[], {
        headPrelude: showConsolePanel ? CONSOLE_BRIDGE : "",
      }),
    [debouncedSignature, showConsolePanel]
  );

  // A new document or "再読み込み" starts a new run: PreviewRun is keyed by it, so the iframe is a
  // new element (the old window then fails the event.source check) and the console starts empty.
  // The run follows srcDoc by adjusting state during render, so a new document mounts once, not
  // first into the old iframe and again after an effect.
  const [run, setRun] = useState(0);
  const [runDoc, setRunDoc] = useState(liveDoc);
  if (!manualRun && runDoc !== liveDoc) {
    setRunDoc(liveDoc);
    setRun((r) => r + 1);
  }

  if (!showPreviewFrame && !showConsolePanel) {
    return null;
  }

  const runManually = () => {
    setManualDoc(buildPreviewDocument(files, { headPrelude: CONSOLE_BRIDGE }));
    setManualRunId((id) => id + 1);
  };

  const frameDoc = manualRun ? manualDoc : runDoc;
  const frameKey = manualRun ? manualRunId : run;
  const showFrame = open && frameDoc !== null && (showPreviewFrame || manualRunId > 0);

  return (
    <div className="relative space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {showPreviewFrame ? "プレビュー" : "コンソール"}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {open && manualRun && (
            <Button type="button" variant="outline" size="sm" onClick={runManually}>
              <Play className="h-4 w-4" />
              実行
            </Button>
          )}
          {open && showPreviewFrame && showConsolePanel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={consoleOpen}
              onClick={() => setConsoleOpen((s) => !s)}
            >
              <Terminal className="h-4 w-4" />
              {consoleOpen ? "コンソールを隠す" : "コンソールを表示"}
            </Button>
          )}
          {open && showPreviewFrame && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRun((r) => r + 1)}>
              <RefreshCw className="h-4 w-4" />
              再読み込み
            </Button>
          )}
          {collapsible && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                // Closing must drop a prior 実行: otherwise reopening would remount the iframe
                // with the old manualDoc and run infinite-loop submissions without confirmation.
                if (open && manualRun) {
                  setManualDoc(null);
                  setManualRunId(0);
                }
                setOpen((o) => !o);
              }}
            >
              {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {open ? "閉じる" : showPreviewFrame ? "プレビューを表示" : "コンソールを表示"}
            </Button>
          )}
        </div>
      </div>
      {manualRun && open && manualRunId === 0 && (
        <p className="text-xs text-muted-foreground">
          「実行」を押すとコンソールに結果を出します。入力中は動きません。
        </p>
      )}
      {showFrame && frameDoc !== null && (
        <PreviewRun
          key={frameKey}
          srcDoc={frameDoc}
          showConsole={showConsolePanel && (manualRun || consoleOpen)}
          hiddenFrame={!showPreviewFrame}
        />
      )}
    </div>
  );
}

function PreviewRun({
  srcDoc,
  showConsole,
  hiddenFrame,
}: {
  srcDoc: string;
  showConsole: boolean;
  hiddenFrame: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Holds up to MAX + 1 lines; the extra one only signals that output was cut off.
  const [entries, setEntries] = useState<PreviewConsoleEntry[]>([]);

  // A layout effect registers in the same commit that inserts the iframe, so the bridge's first
  // lines cannot arrive before the listener exists (a passive effect runs a task later).
  useLayoutEffect(() => {
    // Each postMessage arrives as its own task, so a logging loop would re-render the list once per
    // line; lines are batched and flushed once per animation frame instead.
    let pending: PreviewConsoleEntry[] = [];
    let kept = 0;
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const batch = pending;
      pending = [];
      setEntries((prev) => [...prev, ...batch]);
    };
    const onMessage = (event: MessageEvent) => {
      const entry = acceptPreviewConsoleMessage(event, iframeRef.current?.contentWindow);
      if (!entry || kept > PREVIEW_CONSOLE_MAX_ENTRIES) {
        return;
      }
      kept++;
      pending.push(entry);
      frame ??= requestAnimationFrame(flush);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);
  const truncated = entries.length > PREVIEW_CONSOLE_MAX_ENTRIES;

  return (
    <>
      {/* allow-scripts lets the learner's JavaScript run (the point of the preview), unlike the
          inert sandbox="" of the email template preview. allow-same-origin is deliberately absent:
          it would give that script this origin's cookies, Supabase session and /api access.
          Forms, popups, modals and top navigation stay off for the same reason. A console-only
          exercise uses the same sandbox on an invisible iframe so the script still cannot become
          same-origin. */}
      <iframe
        ref={iframeRef}
        title={hiddenFrame ? "コンソールの実行" : "プレビュー"}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className={
          hiddenFrame
            ? "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            : "h-[360px] w-full rounded-md border bg-white"
        }
      />
      {showConsole && (
        <div className="rounded-md border bg-muted/30">
          <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">
            コンソール
          </div>
          {entries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              プログラムの出力（console）やエラーがここに表示されます
            </p>
          ) : (
            // Rendered as React text (textContent), never as HTML: the lines are the learner's.
            <ol className="max-h-60 overflow-y-auto px-3 py-2 font-mono text-xs">
              {entries.slice(0, PREVIEW_CONSOLE_MAX_ENTRIES).map((entry, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log; identical lines are common.
                  key={index}
                  className={cn("whitespace-pre-wrap break-all", LEVEL_CLASS[entry.level])}
                >
                  {entry.text}
                </li>
              ))}
              {truncated && (
                <li className="text-muted-foreground">
                  （{PREVIEW_CONSOLE_MAX_ENTRIES}件を超えた出力は省略しました）
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </>
  );
}
