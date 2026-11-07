import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function UpgradeLoading() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitleSkeleton />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
