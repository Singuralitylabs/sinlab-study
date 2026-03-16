import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManageSubmissionsLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
