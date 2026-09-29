import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { formatDate } from "@/app/lib/format-date";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import {
  fetchVisibleAnnouncement,
  getAnnouncementViewer,
  isAnnouncementRead,
} from "@/app/services/api/announcements-server";
import { Card, CardContent } from "@/components/ui/card";
import { MarkAnnouncementRead } from "./MarkAnnouncementRead";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const announcementId = parsePositiveInteger((await params).id);
  if (announcementId === null) {
    notFound();
  }

  const viewer = await getAnnouncementViewer();
  if (!viewer) {
    notFound();
  }

  const [{ data: announcement }, isRead] = await Promise.all([
    fetchVisibleAnnouncement(viewer, announcementId),
    isAnnouncementRead(viewer, announcementId),
  ]);
  // 下書き・削除済み・自分が対象でないお知らせは、存在も明かさず 404
  if (!announcement) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title={announcement.title}
        breadcrumbs={[{ label: "お知らせ", href: "/announcements" }, { label: announcement.title }]}
        description={announcement.published_at ? formatDate(announcement.published_at) : undefined}
      />
      {!isRead && <MarkAnnouncementRead announcementId={announcement.id} />}
      <Card>
        <CardContent className="pt-6">
          <MarkdownRenderer content={announcement.body} />
        </CardContent>
      </Card>
    </div>
  );
}
