import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { AdjacentContent, NavigationEndFallback } from "@/app/lib/content-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function boundaryAnnotation(entry: AdjacentContent, direction: "prev" | "next"): string | null {
  if (entry.boundary === "same-phase") return null;
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
  phaseId,
  prev,
  next,
  endFallback,
}: {
  themeId: number;
  phaseId: number;
  prev: AdjacentContent | null;
  next: AdjacentContent | null;
  endFallback: NavigationEndFallback;
}) {
  const prevAnnotation = prev ? boundaryAnnotation(prev, "prev") : null;
  const nextAnnotation = next ? boundaryAnnotation(next, "next") : null;

  // min-w-0: Button is shrink-0 + whitespace-nowrap, so without it a long title keeps the flex item
  // at its full text width and the row overflows on narrow screens.
  return (
    <div className="flex items-center justify-between gap-4">
      {prev ? (
        <Button
          variant="outline"
          asChild
          className={cn("min-w-0 flex-1 justify-start", prevAnnotation && "h-auto py-2")}
        >
          <Link
            href={`/learn/${themeId}/${prev.phaseId}/${prev.id}`}
            aria-label={prevAnnotation ? `${prevAnnotation} ${prev.title}` : undefined}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            <NavLinkText title={prev.title} annotation={prevAnnotation} />
          </Link>
        </Button>
      ) : (
        // Intentional spacer: keeps "next" at the right edge.
        <div className="min-w-0 flex-1" />
      )}

      {next ? (
        <Button
          variant="outline"
          asChild
          className={cn("min-w-0 flex-1 justify-end", nextAnnotation && "h-auto py-2")}
        >
          <Link
            href={`/learn/${themeId}/${next.phaseId}/${next.id}`}
            aria-label={nextAnnotation ? `${nextAnnotation} ${next.title}` : undefined}
          >
            <NavLinkText title={next.title} annotation={nextAnnotation} alignEnd />
            <ChevronRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      ) : (
        <Button asChild className="min-w-0 flex-1 justify-center">
          {endFallback === "phase" ? (
            <Link href={`/learn/${themeId}/${phaseId}`}>フェーズに戻る</Link>
          ) : (
            <Link href={`/learn/${themeId}`}>テーマに戻る</Link>
          )}
        </Button>
      )}
    </div>
  );
}
