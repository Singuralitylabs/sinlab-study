import { CheckCircle, Circle } from "lucide-react";
import Link from "next/link";
import { GETTING_STARTED_STEPS, type GettingStartedStepKey } from "@/app/constants/onboarding";
import type { GettingStartedProgress } from "@/app/services/api/onboarding-server";
import { Card, CardContent } from "@/components/ui/card";

export type GettingStartedChecklistItem = {
  key: GettingStartedStepKey;
  completed: boolean;
  href: string;
};

/**
 * Returns an empty array when progress is null (non-member etc.), which hides the list just like
 * the all-done
 * case. Keep the achievement logic here so callers don't fabricate dummy values.
 */
export function buildGettingStartedItems(
  completedContents: number,
  progress: GettingStartedProgress | null,
  firstThemeHref: string
): GettingStartedChecklistItem[] {
  if (progress == null) {
    return [];
  }
  const completionByKey: Record<GettingStartedStepKey, boolean> = {
    "complete-content": completedContents > 0,
    "submit-exercise": progress.hasSubmission,
    "receive-ai-review": progress.hasCompletedReview,
  };
  const hrefByKey: Record<GettingStartedStepKey, string> = {
    "complete-content": firstThemeHref,
    "submit-exercise": firstThemeHref,
    "receive-ai-review": "/submissions",
  };
  return GETTING_STARTED_STEPS.map((step) => ({
    key: step.key,
    completed: completionByKey[step.key],
    href: hrefByKey[step.key],
  }));
}

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
