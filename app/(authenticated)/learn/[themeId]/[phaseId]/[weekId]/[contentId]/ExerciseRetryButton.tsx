"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ExerciseRetryButtonProps {
  contentId: number;
}

export function ExerciseRetryButton({ contentId }: ExerciseRetryButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch("/api/progress/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "再挑戦を開始できませんでした。時間をおいて再度お試しください。");
        return;
      }
      router.refresh();
    } catch {
      setError("再挑戦を開始できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mb-6">
      <Button
        type="button"
        variant="outline"
        onClick={handleRetry}
        disabled={isPending}
        className="gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        再度課題に取り組む
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
