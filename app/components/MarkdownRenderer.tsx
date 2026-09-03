import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Server Component。react-markdown はデフォルトで生HTMLタグをレンダリングしない
// （rehype-raw 未導入のため、Markdown中の <script> 等は常にエスケープされたテキストとして表示される）
// ため、追加のサニタイズは行わない。
// クライアント側の状態に応じて動的に描画する必要がある箇所（AIレビュー結果など）は、
// このコンポーネントをクライアントコンポーネントから import せず、
// MarkdownRendererClient を使うこと。

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
