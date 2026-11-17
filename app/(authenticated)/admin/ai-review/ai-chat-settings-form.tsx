"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AIChatLimits } from "@/app/constants/ai-chat";
import { Button } from "@/components/ui/button";
import { Field } from "./ai-review-settings-form";

type Bound = { min: number; max: number };

export function AiChatSettingsForm({
  limits,
  bounds,
}: {
  limits: AIChatLimits;
  bounds: { activePerDay: Bound; trialLifetime: Bound };
}) {
  const router = useRouter();
  const [activePerDay, setActivePerDay] = useState(String(limits.activePerDay));
  const [trialLifetime, setTrialLifetime] = useState(String(limits.trialLifetime));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-chat-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activePerDay: Number(activePerDay),
          trialLifetime: Number(trialLifetime),
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
      <Field
        id="chatActivePerDay"
        label="有料会員：1日（JST）"
        hint="全コンテンツの合計。"
        bound={bounds.activePerDay}
        value={activePerDay}
        onChange={setActivePerDay}
      />
      <Field
        id="chatTrialLifetime"
        label="お試し：通算"
        hint="お試しの間はリセットされません。"
        bound={bounds.trialLifetime}
        value={trialLifetime}
        onChange={setTrialLifetime}
      />
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
