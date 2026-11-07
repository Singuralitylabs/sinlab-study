import { FormCardSkeleton, PageTitleSkeleton } from "@/app/components/skeletons";

export default function AdminEmailTemplateEditLoading() {
  return (
    <div className="space-y-6">
      <PageTitleSkeleton breadcrumbs />
      <FormCardSkeleton fields={3} />
    </div>
  );
}
