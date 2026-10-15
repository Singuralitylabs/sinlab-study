"use client";

import { useEffect, useState } from "react";
import { REVIEW_NOTE_MEMO_MAX_LENGTH } from "@/app/constants/review-list";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

async function putReviewNote(body: {
  contentId: number;
  requirementKey: string | null;
  memo?: string | null;
  understood?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch("/api/review-notes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: payload?.error ?? "保存に失敗しました" };
  }
  return { ok: true };
}

export function ReviewNoteMemoField({
  contentId,
  requirementKey,
  initialMemo,
  placeholder = "一言メモ",
  className,
}: {
  contentId: number;
  requirementKey: string | null;
  initialMemo: string | null;
  placeholder?: string;
  className?: string;
}) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setMemo(initialMemo ?? "");
  }, [initialMemo]);

  async function save(next: string) {
    if (next.length > REVIEW_NOTE_MEMO_MAX_LENGTH) {
      setError(`${REVIEW_NOTE_MEMO_MAX_LENGTH}文字以内で入力してください`);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await putReviewNote({
      contentId,
      requirementKey,
      memo: next === "" ? null : next,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  return (
    <div className={className}>
      <Textarea
        value={memo}
        placeholder={placeholder}
        rows={2}
        maxLength={REVIEW_NOTE_MEMO_MAX_LENGTH}
        disabled={saving}
        onChange={(event) => setMemo(event.target.value)}
        onBlur={() => {
          if (memo !== (initialMemo ?? "")) {
            void save(memo);
          }
        }}
        className="min-h-[2.5rem] text-sm"
      />
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {memo.length}/{REVIEW_NOTE_MEMO_MAX_LENGTH}
          {saving ? " · 保存中…" : savedFlash ? " · 保存しました" : null}
        </span>
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}

export function UnderstoodCheckbox({
  contentId,
  requirementKey,
  initialUnderstood,
}: {
  contentId: number;
  requirementKey: string;
  initialUnderstood: boolean;
}) {
  const [checked, setChecked] = useState(initialUnderstood);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecked(initialUnderstood);
  }, [initialUnderstood]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`understood-${contentId}-${requirementKey}`}
          checked={checked}
          onCheckedChange={(value) => {
            const next = value === true;
            setChecked(next);
            setError(null);
            void putReviewNote({
              contentId,
              requirementKey,
              understood: next,
            }).then((result) => {
              if (!result.ok) {
                setChecked(!next);
                setError(result.error);
              }
            });
          }}
        />
        <Label
          htmlFor={`understood-${contentId}-${requirementKey}`}
          className="text-sm font-normal cursor-pointer"
        >
          理解した
        </Label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
