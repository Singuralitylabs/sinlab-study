import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ThemeLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageTitleSkeleton breadcrumbs />

      {/* ThemeHero */}
      <Skeleton className="mb-6 h-36 w-full rounded-xl sm:h-auto sm:aspect-[16/5]" />

      {/* Collapsed phase rows (details > summary) */}
      <div className="grid gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-64 max-w-full" />
              <div className="mt-2 flex items-center gap-3">
                <Skeleton className="h-1.5 w-48" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-5 w-5 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
