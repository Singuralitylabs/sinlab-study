"use client";

import { LogIn, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          <span className="font-bold">デモモード</span>
          {" — "}
          Phase 1 Week 1 のみ閲覧可。進捗はこのブラウザにのみ保存されます。
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            <LogIn className="h-3.5 w-3.5" />
            ログインして全コンテンツへ
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="hover:opacity-70 transition-opacity"
            aria-label="バナーを閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
