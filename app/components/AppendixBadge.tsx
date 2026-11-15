import { Badge } from "@/components/ui/badge";

/**
 * Marks an appendix phase (#556) on learner pages and /manage. Renders nothing for main phases,
 * so callers needn't write `x.is_appendix && <AppendixBadge />`.
 */
export function AppendixBadge({ isAppendix }: { isAppendix: boolean | null | undefined }) {
  if (isAppendix !== true) {
    return null;
  }

  return (
    <Badge variant="outline" className="shrink-0 text-xs">
      付録
    </Badge>
  );
}
