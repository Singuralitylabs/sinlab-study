"use client";

import { Plus, Trash2 } from "lucide-react";
import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import {
  CODE_LANGUAGE_OPTIONS,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import {
  addCodeFile,
  changeCodeFileLanguage,
  type CodeFileInput,
  updateCodeFileAt,
} from "@/app/lib/code-file-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CodeFilesEditorProps = {
  files: CodeFileInput[];
  onChange: (files: CodeFileInput[]) => void;
  defaultLanguage: CodeLanguage;
  /**
   * Always show filename/language controls (admin starter editor). Learner submission form keeps
   * the single-file compact UI until a second file is added.
   */
  forceFileMetaUi?: boolean;
  /** Allow removing the last file (admin can clear starter to null). */
  allowEmpty?: boolean;
  contentPlaceholder?: string;
  addButtonLabel?: string;
};

export function CodeFilesEditor({
  files,
  onChange,
  defaultLanguage,
  forceFileMetaUi = false,
  allowEmpty = false,
  contentPlaceholder = "ここにコードを貼り付けてください...",
  addButtonLabel = "ファイルを追加",
}: CodeFilesEditorProps) {
  const showFileMeta = forceFileMetaUi || files.length > 1;

  const handleFilenameChange = (index: number, filename: string) => {
    onChange(updateCodeFileAt(files, index, { filename, filenameEdited: true }));
  };

  const handleLanguageChange = (index: number, language: CodeLanguage) => {
    onChange(changeCodeFileLanguage(files, index, language));
  };

  const handleAdd = () => {
    onChange(
      addCodeFile(files, defaultLanguage, {
        withDefaultFilename: forceFileMetaUi || files.length >= 1,
      })
    );
  };

  const handleRemove = (index: number) => {
    if (!allowEmpty && files.length <= 1) {
      return;
    }
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {files.map((file, index) => (
        <div
          key={file.id}
          className={showFileMeta ? "space-y-2 rounded-lg border border-border p-3" : "space-y-2"}
        >
          {showFileMeta ? (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor={`filename-${file.id}`} className="text-xs">
                  ファイル名
                </Label>
                <Input
                  id={`filename-${file.id}`}
                  value={file.filename}
                  onChange={(e) => handleFilenameChange(index, e.target.value)}
                  placeholder={`例: ${DEFAULT_FILENAME_BY_LANGUAGE[file.language]}`}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`language-${file.id}`} className="text-xs">
                  言語
                </Label>
                <select
                  id={`language-${file.id}`}
                  value={file.language}
                  onChange={(e) => handleLanguageChange(index, e.target.value as CodeLanguage)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {CODE_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {(allowEmpty || files.length > 1) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  aria-label="このファイルを削除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <Label>コード</Label>
          )}
          <CodeEditor
            value={file.content}
            onChange={(value) => onChange(updateCodeFileAt(files, index, { content: value }))}
            language={file.language}
            placeholder={contentPlaceholder}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
        <Plus className="h-4 w-4" />
        {addButtonLabel}
      </Button>
    </div>
  );
}
