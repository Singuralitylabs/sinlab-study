import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { NavigablePhase } from "@/app/lib/phase-navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PhaseNavLabel({
  label,
  phaseName,
  alignEnd,
}: {
  label: string;
  phaseName: string;
  alignEnd?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", alignEnd && "items-end text-right")}>
      <span className="block w-full truncate text-xs leading-tight text-muted-foreground">
        {label}
      </span>
      <span className="block w-full truncate">{phaseName}</span>
    </span>
  );
}

/**
 * Phase-page footer nav. min-w-0 matches PrevNextNav (#435): Button is shrink-0 +
 * whitespace-nowrap, so long phase names would otherwise overflow on narrow screens.
 */
export function PhasePrevNextNav({
  themeId,
  prev,
  next,
}: {
  themeId: number;
  prev: NavigablePhase | null;
  next: NavigablePhase | null;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      {prev ? (
        <Button variant="outline" asChild className="min-w-0 flex-1 justify-start h-auto py-2">
          <Link href={`/learn/${themeId}/${prev.id}`} aria-label={`前のフェーズ: ${prev.name}`}>
            <ChevronLeft className="h-4 w-4 mr-2 shrink-0" />
            <PhaseNavLabel label="前のフェーズ" phaseName={prev.name} />
          </Link>
        </Button>
      ) : (
        // Intentional spacer: keeps "next" / theme fallback at the right edge.
        <div className="min-w-0 flex-1" />
      )}

      {next ? (
        <Button variant="outline" asChild className="min-w-0 flex-1 justify-end h-auto py-2">
          <Link href={`/learn/${themeId}/${next.id}`} aria-label={`次のフェーズ: ${next.name}`}>
            <PhaseNavLabel label="次のフェーズ" phaseName={next.name} alignEnd />
            <ChevronRight className="h-4 w-4 ml-2 shrink-0" />
          </Link>
        </Button>
      ) : (
        <Button asChild className="min-w-0 flex-1 justify-center">
          <Link href={`/learn/${themeId}`}>テーマに戻る</Link>
        </Button>
      )}
    </div>
  );
}
