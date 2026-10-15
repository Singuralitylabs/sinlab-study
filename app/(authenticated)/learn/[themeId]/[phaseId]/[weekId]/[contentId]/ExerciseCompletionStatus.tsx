"use client";

import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { CERTIFICATE_PASS_SCORE } from "@/app/constants/grading";
import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";
import { Button } from "@/components/ui/button";

interface ExerciseCompletionStatusProps {
  contentId: number;
  initialCompleted: boolean;
  hasPassingReview: boolean;
  userStatus: UserStatusType | null;
  allowsUrlSubmission: boolean;
}

/**
 * Replaces CompleteButton on a rubric exercise. Completion is recorded when a review passes;
 * this control only explains that, or retries the write when the pass was saved and progress was not.
 */
export function ExerciseCompletionStatus({
  contentId,
  initialCompleted,
  hasPassingReview,
  userStatus,
  allowsUrlSubmission,
}: ExerciseCompletionStatusProps) {
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordCompletion = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, isCompleted: true }),
      });
      if (response.ok) {
        setIsCompleted(true);
        router.refresh();
      } else {
        setError("完了を記録できませんでした。時間をおいてもう一度押してください。");
      }
    } catch (caught) {
      console.error("進捗更新エラー:", caught);
      setError("完了を記録できませんでした。時間をおいてもう一度押してください。");
    } finally {
      setIsLoading(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-success">
        <CheckCircle className="h-5 w-5" />
        合格済み（完了）
      </div>
    );
  }

  if (hasPassingReview) {
    return (
      <div className="space-y-2">
        <Button onClick={recordCompletion} disabled={isLoading} size="lg" className="w-full">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "完了を記録する"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
      <p className="flex items-start gap-2">
        <Circle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {`AIレビューで合格（${CERTIFICATE_PASS_SCORE}点以上・未達成の要件なし）すると完了になります`}
        </span>
      </p>
      {allowsUrlSubmission && (
        <p>URL 提出は採点対象外のため、合格にはなりません。コードで提出してください。</p>
      )}
      {userStatus === USER_STATUS.TRIAL && (
        <p>
          {`お試しプランでは AI レビューは 1 課題につき ${AI_REVIEW_LIMITS.trial.perContentLifetime} 回です。不合格だと、お試しの間はこの演習を完了できません。`}
        </p>
      )}
      {userStatus === USER_STATUS.ACTIVE && (
        <p>
          {`不合格が続くと、この課題の AI レビューは 1 日 ${AI_REVIEW_LIMITS.active.perContentPerDay} 回までのため、その日のうちは完了できないことがあります。`}
        </p>
      )}
    </div>
  );
}
