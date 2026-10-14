"use client";

import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildPreviewDocument } from "@/app/lib/html-preview";
import type { CodeFile } from "@/app/types";
import { Button } from "@/components/ui/button";

interface HtmlPreviewProps {
  files: CodeFile[];
  /** History lists mount many previews, so they start collapsed to avoid running every script. */
  collapsible?: boolean;
}

const DEBOUNCE_MS = 300;

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
    () => buildPreviewDocument(JSON.parse(debouncedSignature) as CodeFile[]),
    [debouncedSignature]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">プレビュー</span>
        <div className="flex gap-2">
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
          key={reloadKey}
          title="プレビュー"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="h-[360px] w-full rounded-md border bg-white"
        />
      )}
    </div>
  );
}
