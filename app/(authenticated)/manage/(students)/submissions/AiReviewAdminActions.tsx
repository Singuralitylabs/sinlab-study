"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Admin-only (the page decides); the API enforces it again with requireAdminApi(). */
export function AiReviewAdminActions({
  userId,
  contentId,
  submissionId,
  canReopen,
}: {
  userId: number;
  contentId: number | null;
  submissionId: number;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const post = async (body: Record<string, unknown>, confirmMessage: string, failure: string) => {
    if (!confirm(confirmMessage)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-review-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || failure);
        return;
      }
      router.refresh();
    } catch {
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader2 className="mt-3 h-4 w-4 animate-spin" />;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {contentId !== null && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            post(
              { action: "reset", userId, contentId },
              "このユーザーのこの課題のAIレビュー回数をリセットしますか？\n過去のレビュー結果は残ります。",
              "AIレビュー回数のリセットに失敗しました"
            )
          }
        >
          この課題の回数をリセット
        </Button>
      )}
      {canReopen && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            post(
              { action: "reopen", submissionId },
              "この提出の再レビューを許可しますか？\n現在のレビュー結果は受講生の画面から消え、再実行まで失敗扱いになります（再実行は回数を消費しません）。",
              "再レビューの許可に失敗しました"
            )
          }
        >
          再レビューを許可
        </Button>
      )}
    </div>
  );
}
