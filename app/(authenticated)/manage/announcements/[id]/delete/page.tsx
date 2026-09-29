import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchManageAnnouncementById } from "@/app/services/api/announcements-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../components/DeleteConfirmButton";

export default async function DeleteAnnouncementPage({
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
    <div className="max-w-lg mx-auto">
      <PageTitle title="お知らせの削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              お知らせ「<strong>{announcement.title}</strong>」を削除しますか？
              受講生の画面から消え、まだ送っていないメールも送られなくなります。
            </p>
          </div>
          <DeleteConfirmButton
            deleteUrl={`/api/manage/announcements/${announcementId}`}
            backUrl="/manage/announcements"
          />
        </CardContent>
      </Card>
    </div>
  );
}
