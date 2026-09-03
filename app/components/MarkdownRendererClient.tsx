"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// MarkdownRenderer のクライアントコンポーネント版。
// AIレビュー結果はクライアント側のfetch（提出後の非同期取得）で得た内容を
// 常にクライアントの状態として保持・表示するため、Server Component化した
// MarkdownRenderer をクライアントコンポーネントから import できない
// （import した時点でServer Component化の意味がなくなる上、レビュー対象外の構成になる）。
// そのため、同じ描画ロジックをこちらに複製して保持する。

interface MarkdownRendererClientProps {
  content: string;
  className?: string;
}

export function MarkdownRendererClient({ content, className }: MarkdownRendererClientProps) {
  return (
    <div className={cn("prose prose-stone dark:prose-invert max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
