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
        <span className="block w-full truncate text-xs leading-tight text-muted-foreground">
          {annotation}
        </span>
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

  // When "next" is absent in the degraded case, the primary end button already links to the phase.
  const showPhaseBack = next !== null || endFallback === "theme";

  // min-w-0: Button is shrink-0 + whitespace-nowrap, so without it a long title keeps the grid item
  // at its full text width and the row overflows on narrow screens.
  return (
    <div className="grid grid-cols-2 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
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

      {showPhaseBack && (
        // order-last on mobile drops it to a full-width second row; the sm grid puts it between.
        <Button
          variant="outline"
          asChild
          className="order-last col-span-2 sm:order-none sm:col-span-1"
        >
          <Link href={`/learn/${themeId}/${phaseId}`}>フェーズに戻る</Link>
        </Button>
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
        // sm:col-start-3: without the middle button the auto-placed end button would land in the narrow
        // center column.
        <Button asChild className="min-w-0 flex-1 justify-center sm:col-start-3">
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
