import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContentLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* PageTitle + breadcrumbs skeleton */}
      <div className="mb-6">
        <Skeleton className="h-4 w-80 mb-3" />
        <Skeleton className="h-8 w-64 mb-2" />
      </div>

      {/* コンテンツ本体 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {/* 動画/コンテンツエリア */}
          <Skeleton className="aspect-video w-full mb-6" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </CardContent>
      </Card>

      {/* 完了ボタン */}
      <Skeleton className="h-10 w-full mb-6" />

      {/* 前後ナビゲーション */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}
