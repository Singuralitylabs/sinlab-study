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
 * オンボーディングの完了を記録する。ユーザー操作をブロックしないため
 * fire-and-forget で送る（API失敗時は次回表示時に再度出るだけで、閉じる・遷移は止めない）。
 * `keepalive: true` でダイアログ内リンク経由の遷移中も打ち切られないようにする。
 * 失敗時は警告ログを残し（運用側が恒常的失敗に気付けるようにする）、
 * 成功時は表示側の再取得を促すコールバックを呼ぶ。
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
 * 初回1回だけ表示するウェルカムダイアログ。
 * 表示するステップはサーバー側で status に応じて絞り込んだものを props で受け取る。
 * 閉じるとき（はじめる・×・オーバーレイクリック・ダイアログ内リンク）は完了記録を送り、
 * 成功可否に関わらずダイアログを閉じる。
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

  // 成功時はダッシュボードのサーバー表示を再取得し、再表示の競合を抑える
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
