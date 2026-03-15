import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PhaseLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* PageTitle + breadcrumbs skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-64 mb-3" />
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4">
        {[1, 2].map((week) => (
          <Card key={week}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="space-y-2 ml-11">
                {[1, 2, 3].map((content) => (
                  <div key={content} className="flex items-center gap-3 py-2">
                    <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
