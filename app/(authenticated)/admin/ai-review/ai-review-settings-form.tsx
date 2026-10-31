"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AIReviewLimits } from "@/app/constants/gemini";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Bound = { min: number; max: number };

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  bound: Bound;
  value: string;
  onChange: (value: string) => void;
}

function Field({ id, label, hint, bound, value, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={bound.min}
          max={bound.max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24"
        />
        <span className="text-sm">回</span>
        <span className="text-xs text-muted-foreground">
          {bound.min}〜{bound.max}。{hint}
        </span>
      </div>
    </div>
  );
}

export function AiReviewSettingsForm({
  limits,
  bounds,
}: {
  limits: AIReviewLimits;
  bounds: { perContentPerDay: Bound; perDay: Bound; perContentLifetime: Bound };
}) {
  const router = useRouter();
  const [perContentPerDay, setPerContentPerDay] = useState(String(limits.active.perContentPerDay));
  const [perDay, setPerDay] = useState(String(limits.active.perDay));
  const [lifetime, setLifetime] = useState(String(limits.trial.perContentLifetime));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-review-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activePerContentPerDay: Number(perContentPerDay),
          activePerDay: Number(perDay),
          trialPerContentLifetime: Number(lifetime),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ text: data.error || "保存に失敗しました", isError: true });
        return;
      }
      setMessage({ text: "保存しました", isError: false });
      router.refresh();
    } catch {
      setMessage({ text: "エラーが発生しました", isError: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5 rounded-lg border p-4">
      <div className="space-y-3">
        <h3 className="font-medium">有料会員</h3>
        <Field
          id="perContentPerDay"
          label="1課題につき1日（JST）"
          hint="新しい提出ごとに1回。"
          bound={bounds.perContentPerDay}
          value={perContentPerDay}
          onChange={setPerContentPerDay}
        />
        <Field
          id="perDay"
          label="全課題の合計で1日（JST）"
          hint="1課題あたり以上にしてください。"
          bound={bounds.perDay}
          value={perDay}
          onChange={setPerDay}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-medium">お試し</h3>
        <Field
          id="lifetime"
          label="1課題につき（期間を問わず）"
          hint="お試しの間はリセットされません。"
          bound={bounds.perContentLifetime}
          value={lifetime}
          onChange={setLifetime}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
        {message && (
          <span className={message.isError ? "text-sm text-destructive" : "text-sm text-success"}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
