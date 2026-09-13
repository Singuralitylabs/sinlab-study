"use client";

import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CompleteButtonProps {
  contentId: number;
  initialCompleted: boolean;
}

export function CompleteButton({ contentId, initialCompleted }: CompleteButtonProps) {
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [isLoading, setIsLoading] = useState(false);

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
        setIsCompleted(!isCompleted);
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
  );
}
