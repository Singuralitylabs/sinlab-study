"use client";

import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import { CODE_LANGUAGE_LABELS } from "@/app/components/code-editor-utils";
import type { CodeFileInput } from "@/app/lib/code-file-inputs";
import { Label } from "@/components/ui/label";

type LockedCodeFilesEditorProps = {
  files: CodeFileInput[];
  onChange: (files: CodeFileInput[]) => void;
  contentPlaceholder?: string;
};

/** Filename and language are labels. Learners cannot add, remove, or rename slots. */
export function LockedCodeFilesEditor({
  files,
  onChange,
  contentPlaceholder = "ここにコードを貼り付けてください...",
}: LockedCodeFilesEditorProps) {
  return (
    <div className="space-y-3">
      {files.map((file, index) => (
        <div key={file.id} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>{file.filename}</Label>
            <span className="text-xs text-muted-foreground">
              {CODE_LANGUAGE_LABELS[file.language]}
            </span>
          </div>
          <CodeEditor
            value={file.content}
            onChange={(value) =>
              onChange(
                files.map((current, currentIndex) =>
                  currentIndex === index ? { ...current, content: value } : current
                )
              )
            }
            language={file.language}
            placeholder={contentPlaceholder}
          />
        </div>
      ))}
    </div>
  );
}
