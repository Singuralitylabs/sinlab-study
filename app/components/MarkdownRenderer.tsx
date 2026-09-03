import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// "use client" を持たない共有コンポーネント。hooksやNode専用APIを使わないため、
// Server Component（learn/demo の page.tsx）からはサーバーで、
// Client Component（AIReviewDisplay）からはクライアントバンドルに含まれてクライアントで、
// それぞれ同じ実装のまま描画される。
// react-markdown はデフォルトで生HTMLタグをレンダリングしない
// （rehype-raw 未導入のため、Markdown中の <script> 等は常にエスケープされたテキストとして表示される）
// ため、追加のサニタイズは行わない。

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-stone dark:prose-invert max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
