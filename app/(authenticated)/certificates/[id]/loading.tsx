import { PageTitleSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function CertificateDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageTitleSkeleton breadcrumbs description={false} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="mx-auto aspect-[297/210] w-full min-w-[640px] rounded-lg" />
    </div>
  );
}
