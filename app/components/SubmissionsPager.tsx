import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground/50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      {children}
    </Link>
  );
}

interface SubmissionsPagerProps {
  /** ページャリンクのベースパス（例: `/submissions` / `/manage/submissions`） */
  basePath: string;
  page: number;
  totalPages: number;
}

/**
 * 提出一覧用ページャ（受講生・管理者で共通）
 */
export function SubmissionsPager({ basePath, page, totalPages }: SubmissionsPagerProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-4 mt-6">
      <PagerLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
        前へ
      </PagerLink>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages} ページ
      </span>
      <PagerLink href={`${basePath}?page=${page + 1}`} disabled={page >= totalPages}>
        次へ
        <ChevronRight className="h-4 w-4" />
      </PagerLink>
    </div>
  );
}
