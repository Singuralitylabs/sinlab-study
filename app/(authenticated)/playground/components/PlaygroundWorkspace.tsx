"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PlaygroundEditorFile,
  PlaygroundFilesEditor,
  withoutPlaygroundFileIds,
  withPlaygroundFileIds,
} from "@/app/components/playground/PlaygroundFilesEditor";
import { PlaygroundRunPanel } from "@/app/components/playground/PlaygroundRunPanel";
import {
  PLAYGROUND_KIND_LABELS,
  PLAYGROUND_KINDS,
  PLAYGROUND_SAVE_DEBOUNCE_MS,
  type PlaygroundKind,
} from "@/app/constants/playground";
import {
  defaultPlaygroundFiles,
  type PlaygroundFileInput,
  parsePlaygroundDraft,
  playgroundFilesError,
  playgroundStorageKey,
  serializePlaygroundDraft,
} from "@/app/lib/playground";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PlaygroundTemplateSource {
  slug: string;
  kind: PlaygroundKind;
  files: PlaygroundFileInput[];
}

// The page has nothing else to show, so the editor and preview fill most of the viewport (with a
// floor for short laptop screens) instead of the exercise form's 200px / 360px.
const PLAYGROUND_EDITOR_MIN_HEIGHT = "max(320px, calc(100vh - 400px))";
const PLAYGROUND_FRAME_HEIGHT_CLASS = "h-[max(360px,calc(100vh-400px))]";

type SaveState = "idle" | "saved" | "invalid" | "unavailable";

const SAVE_STATE_TEXT: Record<SaveState, string> = {
  idle: "",
  saved: "保存しました",
  invalid: "",
  unavailable: "このブラウザには保存できませんでした（ページを離れると消えます）",
};

function readDraft(key: string, kind: PlaygroundKind): PlaygroundFileInput[] | null {
  try {
    return parsePlaygroundDraft(kind, window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** false when storage is blocked (private mode, disabled) or full. */
function writeDraft(key: string, files: readonly PlaygroundFileInput[]): boolean {
  try {
    window.localStorage.setItem(key, serializePlaygroundDraft(files));
    return true;
  } catch {
    return false;
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

export function PlaygroundWorkspace({
  userId,
  template = null,
}: {
  userId: number;
  template?: PlaygroundTemplateSource | null;
}) {
  const [kind, setKind] = useState<PlaygroundKind>(template?.kind ?? "web");
  // null until the draft is read after mount: localStorage does not exist during SSR, and
  // rendering defaults first would let the save effect overwrite the stored draft with them.
  const [files, setFiles] = useState<PlaygroundEditorFile[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmReset, setConfirmReset] = useState(false);

  const storageKey = template
    ? playgroundStorageKey(userId, { templateSlug: template.slug })
    : playgroundStorageKey(userId, { kind });

  const startingFiles = useCallback(
    (forKind: PlaygroundKind): PlaygroundFileInput[] =>
      template ? template.files : defaultPlaygroundFiles(forKind),
    [template]
  );

  useEffect(() => {
    setFiles(withPlaygroundFileIds(readDraft(storageKey, kind) ?? startingFiles(kind)));
    setSaveState("idle");
    setConfirmReset(false);
  }, [storageKey, kind, startingFiles]);

  // Latest unsaved edit, flushed when the page is hidden so a closed tab keeps the last keystrokes
  // that the debounce had not written yet.
  const pending = useRef<{ key: string; files: PlaygroundFileInput[] } | null>(null);
  const flush = useCallback(() => {
    const entry = pending.current;
    pending.current = null;
    if (entry) {
      setSaveState(writeDraft(entry.key, entry.files) ? "saved" : "unavailable");
    }
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const updateFiles = (next: PlaygroundEditorFile[]) => {
    setFiles(next);
    const plain = withoutPlaygroundFileIds(next);
    if (playgroundFilesError(kind, plain)) {
      // Over the size limit: keep editing in memory but do not store a draft that would be
      // rejected (and discarded) on the next load.
      pending.current = null;
      setSaveState("invalid");
      return;
    }
    pending.current = { key: storageKey, files: plain };
  };

  useEffect(() => {
    if (!files) {
      return;
    }
    const timer = setTimeout(flush, PLAYGROUND_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [files, flush]);

  const switchKind = (next: PlaygroundKind) => {
    if (next === kind) {
      return;
    }
    flush();
    setFiles(null);
    setKind(next);
  };

  const reset = () => {
    pending.current = null;
    removeDraft(storageKey);
    setFiles(withPlaygroundFileIds(startingFiles(kind)));
    setSaveState("idle");
    setConfirmReset(false);
  };

  const filesError = files ? playgroundFilesError(kind, withoutPlaygroundFileIds(files)) : null;

  return (
    <div className="space-y-4">
      {!template && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="実行の種類">
          {PLAYGROUND_KINDS.map((option) => (
            <Button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === kind}
              variant={option === kind ? "default" : "outline"}
              size="sm"
              onClick={() => switchKind(option)}
            >
              {PLAYGROUND_KIND_LABELS[option]}
            </Button>
          ))}
        </div>
      )}

      {/* min-w-0: a long code line must scroll inside the editor, not widen the page on phones. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardContent className="space-y-3">
            {files ? (
              <PlaygroundFilesEditor
                key={storageKey}
                kind={kind}
                files={files}
                onChange={updateFiles}
                editorMinHeight={PLAYGROUND_EDITOR_MIN_HEIGHT}
              />
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                読み込み中...
              </div>
            )}
            {filesError && saveState === "invalid" && (
              <p className="text-sm text-destructive">{filesError}（このままでは保存されません）</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                このブラウザにだけ自動で保存されます（別の端末では見えません）。
                {saveState !== "invalid" && SAVE_STATE_TEXT[saveState] && (
                  <span
                    className={cn("ml-1", saveState === "unavailable" && "text-destructive")}
                    aria-live="polite"
                  >
                    {SAVE_STATE_TEXT[saveState]}
                  </span>
                )}
              </p>
              {confirmReset ? (
                <span className="flex items-center gap-1 text-xs">
                  {template ? "ひな形の内容に戻しますか？" : "最初のコードに戻しますか？"}
                  書いたコードは消えます。
                  <Button type="button" size="sm" variant="destructive" onClick={reset}>
                    戻す
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmReset(false)}
                  >
                    やめる
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmReset(true)}
                  disabled={!files}
                >
                  <RotateCcw className="h-4 w-4" />
                  {template ? "ひな形に戻す" : "最初のコードに戻す"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent>
            {files && (
              <PlaygroundRunPanel
                kind={kind}
                files={withoutPlaygroundFileIds(files)}
                frameHeightClassName={PLAYGROUND_FRAME_HEIGHT_CLASS}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
