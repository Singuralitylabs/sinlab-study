"use client";

import { FilePlus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import { PLAYGROUND_MAX_FILES, type PlaygroundKind } from "@/app/constants/playground";
import {
  type PlaygroundFileInput,
  playgroundExtensionsLabel,
  playgroundFilenameError,
  playgroundLanguageFor,
} from "@/app/lib/playground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PlaygroundEditorFile extends PlaygroundFileInput {
  /** Client-only key: renaming must not remount the editor or lose the selection. */
  id: string;
}

let nextFileId = 0;

export function withPlaygroundFileIds(
  files: readonly PlaygroundFileInput[]
): PlaygroundEditorFile[] {
  return files.map((file) => ({ ...file, id: `file-${++nextFileId}` }));
}

export function withoutPlaygroundFileIds(
  files: readonly PlaygroundEditorFile[]
): PlaygroundFileInput[] {
  return files.map(({ filename, content }) => ({ filename, content }));
}

type NameForm = { mode: "add" } | { mode: "rename"; id: string };

interface PlaygroundFilesEditorProps {
  kind: PlaygroundKind;
  files: PlaygroundEditorFile[];
  onChange: (files: PlaygroundEditorFile[]) => void;
  editorMinHeight?: string;
}

export function PlaygroundFilesEditor({
  kind,
  files,
  onChange,
  editorMinHeight,
}: PlaygroundFilesEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(files[0]?.id ?? null);
  const [nameForm, setNameForm] = useState<NameForm | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // A reset or kind switch replaces every file; fall back to the first one instead of a blank pane.
  const active = files.find((file) => file.id === activeId) ?? files[0] ?? null;

  const openNameForm = (form: NameForm) => {
    setNameForm(form);
    setNameError(null);
    setConfirmDeleteId(null);
    setNameInput(
      form.mode === "rename" ? (files.find((f) => f.id === form.id)?.filename ?? "") : ""
    );
  };

  const submitName = () => {
    if (!nameForm) {
      return;
    }
    const name = nameInput.trim();
    const others = files
      .filter((file) => nameForm.mode === "add" || file.id !== nameForm.id)
      .map((file) => file.filename);
    const error = playgroundFilenameError(kind, name, others);
    if (error) {
      setNameError(error);
      return;
    }
    if (nameForm.mode === "add") {
      const [added] = withPlaygroundFileIds([{ filename: name, content: "" }]);
      onChange([...files, added]);
      setActiveId(added.id);
    } else {
      onChange(files.map((file) => (file.id === nameForm.id ? { ...file, filename: name } : file)));
    }
    setNameForm(null);
  };

  const deleteFile = (id: string) => {
    const remaining = files.filter((file) => file.id !== id);
    onChange(remaining);
    setConfirmDeleteId(null);
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? null);
    }
  };

  const canAdd = files.length < PLAYGROUND_MAX_FILES;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="ファイル">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            role="tab"
            aria-selected={file.id === active?.id}
            onClick={() => {
              setActiveId(file.id);
              setConfirmDeleteId(null);
            }}
            className={cn(
              "rounded-md border px-3 py-1 font-mono text-xs transition-colors",
              file.id === active?.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {file.filename}
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => openNameForm({ mode: "add" })}
          disabled={!canAdd}
          title={canAdd ? undefined : `ファイルは${PLAYGROUND_MAX_FILES}個までです`}
        >
          <FilePlus className="h-4 w-4" />
          ファイルを追加
        </Button>
      </div>

      {nameForm && (
        <form
          className="space-y-1 rounded-md border bg-muted/30 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitName();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={nameForm.mode === "add" ? "追加するファイルの名前" : "新しいファイル名"}
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameError(null);
              }}
              placeholder={`例: sample${playgroundExtensionsLabel(kind).split(" / ")[0]}`}
              className="h-8 max-w-xs font-mono text-sm"
              autoFocus
            />
            <Button type="submit" size="sm">
              {nameForm.mode === "add" ? "追加" : "名前を変える"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNameForm(null)}>
              やめる
            </Button>
          </div>
          <p className={cn("text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
            {nameError ?? `使える拡張子: ${playgroundExtensionsLabel(kind)}`}
          </p>
        </form>
      )}

      {active && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openNameForm({ mode: "rename", id: active.id })}
            >
              <Pencil className="h-4 w-4" />
              名前を変更
            </Button>
            {confirmDeleteId === active.id ? (
              <span className="flex items-center gap-1 text-xs">
                「{active.filename}」を削除しますか？
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteFile(active.id)}
                >
                  削除する
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  やめる
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteId(active.id)}
                // The runners need at least one file; an empty set has nothing to run or save.
                disabled={files.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
                削除
              </Button>
            )}
          </div>
          <CodeEditor
            key={active.id}
            value={active.content}
            onChange={(content) =>
              onChange(files.map((file) => (file.id === active.id ? { ...file, content } : file)))
            }
            language={playgroundLanguageFor(kind, active.filename) ?? "javascript"}
            placeholder="ここにコードを書いてください"
            minHeight={editorMinHeight}
          />
        </>
      )}
    </div>
  );
}
