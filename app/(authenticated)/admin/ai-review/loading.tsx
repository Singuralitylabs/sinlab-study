import { FormCardSkeleton, PageTitleSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAiReviewLoading() {
  return (
    <div className="space-y-6">
      <PageTitleSkeleton />
      <Skeleton className="h-3 w-80 max-w-full" />
      <FormCardSkeleton fields={3} />
    </div>
  );
}
