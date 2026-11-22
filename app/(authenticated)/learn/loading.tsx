import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LearnLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageTitleSkeleton />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-5 w-5" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4 mt-1" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
