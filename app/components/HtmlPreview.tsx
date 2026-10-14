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

const LEVEL_CLASS: Record<PreviewConsoleEntry["level"], string> = {
  log: "text-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
};

export function HtmlPreview({ files, collapsible = false }: HtmlPreviewProps) {
  const [open, setOpen] = useState(!collapsible);
  const [showConsole, setShowConsole] = useState(true);
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

  // A new document or "再読み込み" starts a new run: PreviewRun is keyed by it, so the iframe is a
  // new element (the old window then fails the event.source check) and the console starts empty.
  // The run follows srcDoc by adjusting state during render, so a new document mounts once, not
  // first into the old iframe and again after an effect.
  const [run, setRun] = useState(0);
  const [runDoc, setRunDoc] = useState(srcDoc);
  if (runDoc !== srcDoc) {
    setRunDoc(srcDoc);
    setRun((r) => r + 1);
  }

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
            <Button type="button" variant="outline" size="sm" onClick={() => setRun((r) => r + 1)}>
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
      {open && <PreviewRun key={run} srcDoc={runDoc} showConsole={showConsole} />}
    </div>
  );
}

function PreviewRun({ srcDoc, showConsole }: { srcDoc: string; showConsole: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [entries, setEntries] = useState<PreviewConsoleEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const received = useRef(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const entry = acceptPreviewConsoleMessage(event, iframeRef.current?.contentWindow);
      if (!entry) {
        return;
      }
      if (received.current >= PREVIEW_CONSOLE_MAX_ENTRIES) {
        setTruncated(true);
        return;
      }
      received.current++;
      setEntries((prev) => [...prev, entry]);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      {/* allow-scripts lets the learner's JavaScript run (the point of the preview), unlike the
          inert sandbox="" of the email template preview. allow-same-origin is deliberately absent:
          it would give that script this origin's cookies, Supabase session and /api access.
          Forms, popups, modals and top navigation stay off for the same reason. */}
      <iframe
        ref={iframeRef}
        title="プレビュー"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="h-[360px] w-full rounded-md border bg-white"
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
              {entries.map((entry, index) => (
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
