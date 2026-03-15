import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <Skeleton className="h-9 w-48 mb-6" />

      {/* 全体進捗カード */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-2 w-full" />
          <div className="flex justify-end mt-2">
            <Skeleton className="h-4 w-10" />
          </div>
        </CardContent>
      </Card>

      {/* テーマ一覧 */}
      <div className="grid gap-4">
        <Skeleton className="h-6 w-32" />
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex">
              <Skeleton className="w-24 h-24 rounded-none shrink-0" />
              <CardContent className="pt-4 pb-4 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-4 w-56 mb-3 ml-6" />
                <Skeleton className="h-2 w-full ml-6" />
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
