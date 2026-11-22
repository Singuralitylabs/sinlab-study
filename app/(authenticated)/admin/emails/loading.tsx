import { PageTitleSkeleton, TableCardSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminEmailsLoading() {
  return (
    <div className="space-y-8">
      <PageTitleSkeleton description={false} />
      <Skeleton className="h-4 w-72" />
      <section className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </section>
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <TableCardSkeleton columns={5} rows={6} />
      </section>
    </div>
  );
}
