"use client";

import { ReviewNoteMemoField } from "@/app/components/ReviewNoteEditor";

/** Free-form learning memo for a content (requirement_key = null). */
export function LearningMemo({
  contentId,
  initialMemo,
}: {
  contentId: number;
  initialMemo: string | null;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-2">学習メモ</h2>
      <p className="text-sm text-muted-foreground mb-3">
        このコンテンツについての自由なメモです。復習リストにも表示されます。
      </p>
      <ReviewNoteMemoField
        contentId={contentId}
        requirementKey={null}
        initialMemo={initialMemo}
        placeholder="学習メモを書く（任意）"
      />
    </section>
  );
}
