"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { CodeEditorNoSSR as CodeEditor } from "@/app/components/CodeEditorNoSSR";
import {
  buildDefaultFilename,
  CODE_LANGUAGE_OPTIONS,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import {
  resolveSubmissionFileSlots,
  SUBMISSION_FILE_SLOT_MAX_COUNT,
} from "@/app/lib/submission-file-slots";
import type { CodeFile } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SubmissionSlotDraft = {
  id: string;
  filename: string;
  language: CodeLanguage;
  starterContent: string;
};

export function buildInitialSubmissionSlotDrafts(input: {
  submissionFileSlots: unknown;
  starterFiles: CodeFile[] | null;
  codeLanguage: string | null | undefined;
}): SubmissionSlotDraft[] {
  const slots = resolveSubmissionFileSlots({
    submissionFileSlots: input.submissionFileSlots,
    starterFiles: input.starterFiles,
    codeLanguage: input.codeLanguage,
  });
  const starters = input.starterFiles ?? [];
  return slots.map((slot, index) => {
    const byIndex = starters[index];
    const aligned =
      byIndex !== undefined &&
      byIndex.filename.trim() === slot.filename &&
      byIndex.language === slot.language;
    const fallback = starters.find(
      (file) => file.filename.trim() === slot.filename && file.language === slot.language
    );
    return {
      id: `slot-${index}`,
      filename: slot.filename,
      language: slot.language,
      starterContent: aligned ? byIndex.content : (fallback?.content ?? ""),
    };
  });
}

function createSubmissionSlotDraft(
  language: CodeLanguage,
  existingFilenames: string[]
): SubmissionSlotDraft {
  return {
    id: crypto.randomUUID(),
    filename: buildDefaultFilename(language, existingFilenames),
    language,
    starterContent: "",
  };
}

type SubmissionFileSlotsEditorProps = {
  slots: SubmissionSlotDraft[];
  onChange: (slots: SubmissionSlotDraft[]) => void;
};

export function SubmissionFileSlotsEditor({ slots, onChange }: SubmissionFileSlotsEditorProps) {
  const update = (index: number, patch: Partial<SubmissionSlotDraft>) => {
    onChange(slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
  };

  const changeLanguage = (index: number, language: CodeLanguage) => {
    const current = slots[index];
    const previousDefault = DEFAULT_FILENAME_BY_LANGUAGE[current.language];
    const others = slots.filter((_, slotIndex) => slotIndex !== index).map((slot) => slot.filename);
    const filename =
      current.filename.trim().length === 0 || current.filename.trim() === previousDefault
        ? buildDefaultFilename(language, others)
        : current.filename;
    update(index, { language, filename });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slots.length) {
      return;
    }
    const next = [...slots];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onChange(next);
  };

  const addSlot = () => {
    if (slots.length >= SUBMISSION_FILE_SLOT_MAX_COUNT) {
      return;
    }
    const language = slots[0]?.language ?? "javascript";
    onChange([
      ...slots,
      createSubmissionSlotDraft(
        language,
        slots.map((slot) => slot.filename)
      ),
    ]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) {
      return;
    }
    onChange(slots.filter((_, slotIndex) => slotIndex !== index));
  };

  return (
    <div className="space-y-3">
      {slots.map((slot, index) => (
        <div key={slot.id} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`slot-filename-${slot.id}`} className="text-xs">
                ファイル名
              </Label>
              <Input
                id={`slot-filename-${slot.id}`}
                value={slot.filename}
                onChange={(event) => update(index, { filename: event.target.value })}
                placeholder={`例: ${DEFAULT_FILENAME_BY_LANGUAGE[slot.language]}`}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`slot-language-${slot.id}`} className="text-xs">
                言語
              </Label>
              <select
                id={`slot-language-${slot.id}`}
                value={slot.language}
                onChange={(event) => changeLanguage(index, event.target.value as CodeLanguage)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {CODE_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="このファイルを上へ"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(index, 1)}
              disabled={index === slots.length - 1}
              aria-label="このファイルを下へ"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeSlot(index)}
              disabled={slots.length <= 1}
              aria-label="このファイルを削除"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">初期コード（任意）</Label>
            <CodeEditor
              value={slot.starterContent}
              onChange={(value) => update(index, { starterContent: value })}
              language={slot.language}
              placeholder="受講生に最初から表示するコード。空なら空欄で始まります..."
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addSlot}
        disabled={slots.length >= SUBMISSION_FILE_SLOT_MAX_COUNT}
      >
        <Plus className="h-4 w-4" />
        ファイルを追加
      </Button>
    </div>
  );
}
