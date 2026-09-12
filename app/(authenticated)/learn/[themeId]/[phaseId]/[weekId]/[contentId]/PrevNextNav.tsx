import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { AdjacentContent } from "@/app/lib/content-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function boundaryAnnotation(entry: AdjacentContent, direction: "prev" | "next"): string | null {
  if (entry.boundary === "same-week") return null;
  if (entry.boundary === "week") {
    return direction === "next" ? `次の週: ${entry.weekName}` : `前の週: ${entry.weekName}`;
  }
  return direction === "next"
    ? `次のフェーズ: ${entry.phaseName}`
    : `前のフェーズ: ${entry.phaseName}`;
}

function NavLinkText({
  title,
  annotation,
  alignEnd,
}: {
  title: string;
  annotation: string | null;
  alignEnd?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", alignEnd && "items-end text-right")}>
      {annotation ? (
        <span className="text-xs leading-tight text-muted-foreground">{annotation}</span>
      ) : null}
      <span className="block w-full truncate">{title}</span>
    </span>
  );
}

export function PrevNextNav({
  themeId,
  prev,
  next,
}: {
  themeId: number;
  prev: AdjacentContent | null;
  next: AdjacentContent | null;
}) {
  const prevAnnotation = prev ? boundaryAnnotation(prev, "prev") : null;
  const nextAnnotation = next ? boundaryAnnotation(next, "next") : null;

  return (
    <div className="flex items-center justify-between gap-4">
      {prev ? (
        <Button
          variant="outline"
          asChild
          className={cn("flex-1 justify-start", prevAnnotation && "h-auto py-2")}
        >
          <Link
            href={`/learn/${themeId}/${prev.phaseId}/${prev.weekId}/${prev.id}`}
            aria-label={prevAnnotation ? `${prevAnnotation} ${prev.title}` : undefined}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            <NavLinkText title={prev.title} annotation={prevAnnotation} />
          </Link>
        </Button>
      ) : (
        // 意図的なスペーサ。「次へ」を右端に保つために必要
        <div className="flex-1" />
      )}

      {next ? (
        <Button
          variant="outline"
          asChild
          className={cn("flex-1 justify-end", nextAnnotation && "h-auto py-2")}
        >
          <Link
            href={`/learn/${themeId}/${next.phaseId}/${next.weekId}/${next.id}`}
            aria-label={nextAnnotation ? `${nextAnnotation} ${next.title}` : undefined}
          >
            <NavLinkText title={next.title} annotation={nextAnnotation} alignEnd />
            <ChevronRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      ) : (
        <Button asChild className="flex-1 justify-center">
          <Link href={`/learn/${themeId}`}>テーマに戻る</Link>
        </Button>
      )}
    </div>
  );
}
