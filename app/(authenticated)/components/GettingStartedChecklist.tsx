import { CheckCircle, Circle } from "lucide-react";
import Link from "next/link";
import { GETTING_STARTED_STEPS } from "@/app/constants/onboarding";
import { Card, CardContent } from "@/components/ui/card";

export type GettingStartedChecklistItem = {
  key: string;
  completed: boolean;
  href: string;
};

/**
 * ダッシュボードに常設するはじめかたチェックリスト。
 * 判定結果を受け取って描画するだけの純粋な表示コンポーネント。
 * 全ステップ達成のときは描画しない（永続化不要）。
 */
export function GettingStartedChecklist({ items }: { items: GettingStartedChecklistItem[] }) {
  const unachievedExists = items.some((item) => !item.completed);
  if (!unachievedExists) {
    return null;
  }

  const completedCount = items.filter((item) => item.completed).length;
  const stepByKey = new Map(GETTING_STARTED_STEPS.map((step) => [step.key, step]));

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">
          はじめかた {completedCount} / {items.length}
        </h2>
        <ul className="space-y-3">
          {items.map((item) => {
            const step = stepByKey.get(item.key);
            if (!step) {
              return null;
            }
            const Icon = item.completed ? CheckCircle : Circle;
            const iconClass = item.completed ? "text-success" : "text-muted-foreground";
            return (
              <li key={item.key} className="flex items-start gap-3">
                <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconClass}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  {!item.completed && (
                    <Link
                      href={item.href}
                      className="text-sm text-primary underline underline-offset-4"
                    >
                      始める
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
