"use client";

import Link from "next/link";
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
 * 初回1回だけ表示するウェルカムダイアログ。
 * 表示するステップはサーバー側で status に応じて絞り込んだものを props で受け取る。
 * 閉じるとき（はじめる・×・オーバーレイクリック）に POST /api/onboarding/complete を呼び、
 * 成功可否に関わらずダイアログを閉じる（API失敗時は次回表示時に再度出るだけ）。
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

  if (steps.length === 0) {
    return null;
  }

  const current = steps[Math.min(index, steps.length - 1)];
  const isFirst = index <= 0;
  const isLast = index >= steps.length - 1;

  const completeOnboarding = () => {
    // ユーザー操作をブロックしない。失敗時は次回表示時に再度出る
    fetch("/api/onboarding/complete", { method: "POST" }).catch(() => undefined);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      completeOnboarding();
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  const handleStart = () => {
    completeOnboarding();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
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
              <Link href="/upgrade" className="text-primary underline underline-offset-4">
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
