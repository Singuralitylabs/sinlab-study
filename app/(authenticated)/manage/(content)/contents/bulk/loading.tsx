import { PageTitleSkeleton, TableCardSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManageContentsBulkLoading() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageTitleSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>
      <TableCardSkeleton columns={6} rows={8} />
    </div>
  );
}
