import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* HomeHero */}
      <div className="mb-6">
        <Skeleton className="aspect-video w-full rounded-xl lg:aspect-[8/3]" />
        <Skeleton className="mt-4 h-8 w-64 sm:h-9" />
        <Skeleton className="mt-2 h-5 w-72" />
      </div>

      {/* ActiveThemesSection */}
      <div className="mb-6 grid gap-4">
        <Skeleton className="h-7 w-40" />
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden py-0">
            <div className="flex">
              <Skeleton className="min-h-24 w-36 shrink-0 rounded-none sm:w-44" />
              <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4 sm:px-6">
                <div className="mb-1 flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="mb-2 ml-6 h-4 w-56" />
                <Skeleton className="ml-6 h-2" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
