"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/app/constants/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function FeedbackStatusForm({
  feedbackId,
  initialStatus,
}: {
  feedbackId: number;
  initialStatus: FeedbackStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/manage/feedbacks/${feedbackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "状態の更新に失敗しました");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("状態の更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="feedback-status">対応状態</Label>
        <select
          id="feedback-status"
          className="border-input bg-transparent flex h-9 w-full max-w-xs rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
        >
          {FEEDBACK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {FEEDBACK_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && !error && (
        <Alert>
          <AlertDescription>状態を更新しました。</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        onClick={handleSave}
        disabled={isSaving || status === initialStatus}
        className="gap-2"
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        状態を保存
      </Button>
    </div>
  );
}
