import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PhaseLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageTitleSkeleton breadcrumbs />
      <Skeleton className="-mt-3 mb-6 h-4 w-20" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="gap-0 overflow-hidden py-0">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
