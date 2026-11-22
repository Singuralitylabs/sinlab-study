import { ListCardsSkeleton, PageTitleSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CertificatesLoading() {
  return (
    <div className="max-w-4xl mx-auto">
      <PageTitleSkeleton />
      <Skeleton className="mb-3 h-7 w-32" />
      <div className="mb-8">
        <ListCardsSkeleton rows={2} />
      </div>
      <Skeleton className="mb-3 h-7 w-36" />
      <ListCardsSkeleton rows={2} />
    </div>
  );
}
