"use client";

import { CheckCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoProgress } from "../hooks/useDemoProgress";

interface DemoCompleteButtonProps {
  contentId: number;
}

export function DemoCompleteButton({ contentId }: DemoCompleteButtonProps) {
  const { isCompleted, toggleComplete } = useDemoProgress();
  const completed = isCompleted(contentId);

  return (
    <Button
      onClick={() => toggleComplete(contentId)}
      variant={completed ? "secondary" : "default"}
      size="lg"
      className={`w-full ${completed ? "border-success/30 bg-success/10 text-success hover:bg-success/20" : ""}`}
    >
      {completed ? (
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
  );
}
