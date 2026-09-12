"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIReviewDisplayProps } from "./AIReviewDisplay";

// MarkdownRenderer（react-markdown + lowlight + highlight.js）を含む AIReviewDisplay を
// レビュー表示時のみ遅延読み込みする。video / text / slide などレビューが無いページの
// First Load JS から切り離す（CodeEditorNoSSR / PdfSlideViewerNoSSR と同方式）。
const AIReviewDisplayDynamic = dynamic<AIReviewDisplayProps>(
  () => import("@/app/components/AIReviewDisplay").then((m) => m.AIReviewDisplay),
  {
    ssr: false,
    // 折りたたみヘッダー（p-4 + アイコン行）と同程度の高さにしてレイアウトシフトを抑える
    loading: () => (
      <div className="mt-4 border rounded-lg overflow-hidden">
        <div className="w-full p-4 flex items-center gap-2 bg-muted/30">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
    ),
  }
);

/**
 * レビュー／ローディング時のみ dynamic チャンクをマウントする薄いラッパー。
 * 呼び出し側が無条件にマウントしても First Load に Markdown ハイライタを載せない。
 */
export function AIReviewDisplayNoSSR(props: AIReviewDisplayProps) {
  if (!props.review && !props.isLoading) {
    return null;
  }
  return <AIReviewDisplayDynamic {...props} />;
}
