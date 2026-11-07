import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManageLoading() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageTitleSkeleton />

      {/* Summary strip */}
      <div className="mb-8 flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex min-w-[8rem] items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-8" />
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
