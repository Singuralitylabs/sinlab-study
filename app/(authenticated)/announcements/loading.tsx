import { ListCardsSkeleton, PageTitleSkeleton } from "@/app/components/skeletons";

export default function AnnouncementsLoading() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitleSkeleton />
      <ListCardsSkeleton rows={5} />
    </div>
  );
}
