"use client";

import Link from "next/link";
import { useState } from "react";
import { ReviewNoteMemoField, UnderstoodCheckbox } from "@/app/components/ReviewNoteEditor";
import type {
  FreeMemoView,
  OrphanMemoView,
  ReviewListItemView,
} from "@/app/services/api/review-list-server";

type Tab = "open" | "overcome";

function groupByTheme(
  items: ReviewListItemView[]
): { themeId: number; themeName: string; items: ReviewListItemView[] }[] {
  const groups: { themeId: number; themeName: string; items: ReviewListItemView[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.themeId === item.themeId) {
      last.items.push(item);
    } else {
      groups.push({ themeId: item.themeId, themeName: item.themeName, items: [item] });
    }
  }
  return groups;
}

export function ReviewListClient({
  unovercome,
  overcome,
  orphanMemos,
  freeMemos,
}: {
  unovercome: ReviewListItemView[];
  overcome: ReviewListItemView[];
  orphanMemos: OrphanMemoView[];
  freeMemos: FreeMemoView[];
}) {
  const [tab, setTab] = useState<Tab>("open");
  const items = tab === "open" ? unovercome : overcome;
  const groups = groupByTheme(items);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("open")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "open"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          未克服（{unovercome.length}）
        </button>
        <button
          type="button"
          onClick={() => setTab("overcome")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "overcome"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          克服済み（{overcome.length}）
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {tab === "open" ? "未克服の項目はありません。" : "克服済みの項目はまだありません。"}
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.themeId}>
              <h2 className="text-lg font-semibold mb-3">{group.themeName}</h2>
              <ul className="space-y-4">
                {group.items.map((item) => {
                  const muted = tab === "open" && item.understoodAt != null;
                  return (
                    <li
                      key={`${item.contentId}:${item.requirementKey}:${item.reviewId ?? "r"}`}
                      className={`rounded-lg border border-border p-4 space-y-3 ${
                        muted ? "opacity-50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <Link href={item.href} className="font-medium text-primary hover:underline">
                          {item.contentTitle}
                        </Link>
                        <p className="mt-1 text-sm font-medium">{item.requirementName}</p>
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                          {item.comment}
                        </p>
                      </div>
                      {tab === "open" && (
                        <>
                          <ReviewNoteMemoField
                            contentId={item.contentId}
                            requirementKey={item.requirementKey}
                            initialMemo={item.memo}
                          />
                          <UnderstoodCheckbox
                            contentId={item.contentId}
                            requirementKey={item.requirementKey}
                            initialUnderstood={item.understoodAt != null}
                          />
                        </>
                      )}
                      {tab === "overcome" && item.memo && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          メモ: {item.memo}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {orphanMemos.length > 0 && (
        <section className="pt-4 border-t border-border">
          <h2 className="text-base font-medium text-muted-foreground mb-1">
            メモのみ（以前のレビュー）
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            参考採点の項目が置き換わったあとでも、書いたメモはここに残ります。
          </p>
          <ul className="space-y-3">
            {orphanMemos.map((orphan) => (
              <li
                key={`${orphan.contentId}:${orphan.requirementKey}`}
                className="rounded-lg border border-dashed border-border p-4 space-y-3"
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">{orphan.themeName}</p>
                  <Link href={orphan.href} className="font-medium text-primary hover:underline">
                    {orphan.contentTitle}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">{orphan.requirementKey}</p>
                </div>
                <ReviewNoteMemoField
                  contentId={orphan.contentId}
                  requirementKey={orphan.requirementKey}
                  initialMemo={orphan.memo}
                />
                <UnderstoodCheckbox
                  contentId={orphan.contentId}
                  requirementKey={orphan.requirementKey}
                  initialUnderstood={orphan.understoodAt != null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {freeMemos.length > 0 && (
        <section className="pt-4 border-t border-border">
          <h2 className="text-lg font-semibold mb-3">学習メモがあるコンテンツ</h2>
          <ul className="space-y-3">
            {freeMemos.map((memo) => (
              <li key={memo.contentId} className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">{memo.themeName}</p>
                <Link href={memo.href} className="font-medium text-primary hover:underline">
                  {memo.contentTitle}
                </Link>
                <p className="mt-2 text-sm whitespace-pre-wrap">{memo.memo}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
