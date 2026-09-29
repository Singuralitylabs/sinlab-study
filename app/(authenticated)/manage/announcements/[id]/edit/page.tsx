import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchManageAnnouncementById } from "@/app/services/api/announcements-server";
import { AnnouncementForm } from "../../AnnouncementForm";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const announcementId = parsePositiveInteger((await params).id);
  if (announcementId === null) {
    notFound();
  }
  const { data: announcement } = await fetchManageAnnouncementById(announcementId);
  if (!announcement) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="お知らせの編集"
        breadcrumbs={[
          { label: "お知らせ管理", href: "/manage/announcements" },
          { label: announcement.title },
        ]}
      />
      <AnnouncementForm mode="edit" initialData={announcement} />
    </div>
  );
}
