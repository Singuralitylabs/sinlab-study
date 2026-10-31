import { ListChecks } from "lucide-react";
import Link from "next/link";

/** One-line home cue when the learner has open review-list items. Not a card. */
export function ReviewListHomeLine({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }

  return (
    <p className="mb-4 text-sm">
      <Link
        href="/review-list"
        className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
      >
        <ListChecks className="h-4 w-4 shrink-0" aria-hidden />
        復習リストに {count} 件
      </Link>
    </p>
  );
}
