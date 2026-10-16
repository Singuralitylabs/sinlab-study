"use client";

import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeCompletionDialog } from "@/app/components/ThemeCompletionDialog";
import {
  noticeFromProgressBody,
  type ThemeCompletionNotice,
} from "@/app/lib/certificate-eligibility";
import { Button } from "@/components/ui/button";

interface CompleteButtonProps {
  contentId: number;
  initialCompleted: boolean;
  /**
   * Only the quiz page needs this (QuizForm decides from the saved progress whether to record
   * completion after a re-answer). Elsewhere a refresh is costly: a slide page re-issues its
   * signed URL, which makes the PDF viewer reload the document.
   */
  refreshOnToggle?: boolean;
}

export function CompleteButton({
  contentId,
  initialCompleted,
  refreshOnToggle = false,
}: CompleteButtonProps) {
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [isLoading, setIsLoading] = useState(false);
  const [themeNotice, setThemeNotice] = useState<ThemeCompletionNotice | null>(null);

  const handleToggle = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId,
          isCompleted: !isCompleted,
        }),
      });

      if (response.ok) {
        const nextCompleted = !isCompleted;
        const body = await response.json().catch(() => null);
        setIsCompleted(nextCompleted);
        setThemeNotice(noticeFromProgressBody(nextCompleted, body));
        if (refreshOnToggle) {
          router.refresh();
        }
      } else {
        console.error("進捗更新エラー");
      }
    } catch (error) {
      console.error("進捗更新エラー:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {themeNotice && <ThemeCompletionDialog notice={themeNotice} />}
      <Button
        onClick={handleToggle}
        disabled={isLoading}
        variant={isCompleted ? "secondary" : "default"}
        size="lg"
        className={`w-full ${isCompleted ? "border-success/30 bg-success/10 text-success hover:bg-success/20" : ""}`}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isCompleted ? (
          <>
            <CheckCircle className="h-5 w-5" />
            完了済み（クリックで未完了に戻す）
          </>
        ) : (
          <>
            <Circle className="h-5 w-5" />
            このコンテンツを完了としてマーク
          </>
        )}
      </Button>
    </>
  );
}
