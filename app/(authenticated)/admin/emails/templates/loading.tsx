import { FormCardSkeleton, PageTitleSkeleton } from "@/app/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminEmailTemplatesLoading() {
  return (
    <div className="space-y-8">
      <PageTitleSkeleton breadcrumbs />
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <FormCardSkeleton fields={2} />
      </section>
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <FormCardSkeleton fields={3} />
      </section>
    </div>
  );
}
