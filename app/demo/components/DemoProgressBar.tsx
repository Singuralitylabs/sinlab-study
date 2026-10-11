"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDemoProgress } from "../hooks/useDemoProgress";

interface DemoProgressBarProps {
  contentIds: number[];
}

export function DemoProgressBar({ contentIds }: DemoProgressBarProps) {
  const { completedCount } = useDemoProgress();

  const total = contentIds.length;
  if (total === 0) return null;

  const completed = completedCount(contentIds);
  const percent = Math.round((completed / total) * 100);

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            進捗: {completed} / {total} 完了
          </span>
          <span className="text-sm font-medium">{percent}%</span>
        </div>
        <Progress value={percent} className="h-2" />
      </CardContent>
    </Card>
  );
}
