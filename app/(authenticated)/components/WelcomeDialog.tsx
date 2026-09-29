"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WelcomeDialogStep } from "@/app/constants/onboarding";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Records onboarding completion fire-and-forget so it never blocks the user (on API failure the
 * dialog just shows again next time; closing/navigation isn't stopped). keepalive: true keeps the
 * request alive during navigation via in-dialog links. Failures log a warning so ops can notice
 * persistent failures; success calls a callback to refresh the display side.
 */
export function requestOnboardingComplete(onCompleted?: () => void): void {
  fetch("/api/onboarding/complete", { method: "POST", keepalive: true })
    .then((res) => {
      if (!res.ok) {
        console.warn(`オンボーディングの完了記録に失敗しました: ${res.status}`);
        return;
      }
      onCompleted?.();
    })
    .catch(() => {
      console.warn("オンボーディングの完了記録に失敗しました");
    });
}

/**
 * Steps are filtered by status on the server. Closing by any route sends the completion record and
 * closes the dialog regardless of whether it succeeds.
 */
export function WelcomeDialog({
  steps,
  stripeEnabled,
}: {
  steps: WelcomeDialogStep[];
  stripeEnabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const router = useRouter();

  if (steps.length === 0) {
    return null;
  }

  const current = steps[Math.min(index, steps.length - 1)];
  const isFirst = index <= 0;
  const isLast = index >= steps.length - 1;

  // Refetch the dashboard server render on success to reduce re-display races.
  const completeAndRefresh = () => requestOnboardingComplete(() => router.refresh());

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      completeAndRefresh();
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  const handleStart = () => {
    completeAndRefresh();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>
            {index + 1} / {steps.length}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm leading-relaxed">
          <p>{current.body}</p>
          {current.showsUpgradeLink && stripeEnabled && (
            <p className="mt-3">
              <Link
                href="/upgrade"
                onClick={completeAndRefresh}
                className="text-primary underline underline-offset-4"
              >
                プラン・お支払いを見る
              </Link>
            </p>
          )}
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setIndex(index - 1)} disabled={isFirst}>
            戻る
          </Button>
          {isLast ? (
            <Button onClick={handleStart}>はじめる</Button>
          ) : (
            <Button onClick={() => setIndex(index + 1)}>次へ</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
