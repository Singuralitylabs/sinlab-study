import { Edit, Eye, EyeOff, Mail, MailCheck, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import {
  ANNOUNCEMENT_MEMBERSHIP_LABELS,
  ANNOUNCEMENT_TARGET_STATUS_LABELS,
} from "@/app/constants/announcements";
import { describeAnnouncementTargets } from "@/app/lib/announcement-target";
import { formatDate } from "@/app/lib/format-date";
import {
  fetchManageAnnouncements,
  type ManageAnnouncementListItem,
} from "@/app/services/api/announcements-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function EmailStatus({ announcement }: { announcement: ManageAnnouncementListItem }) {
  if (!announcement.send_email) {
    return <span className="text-sm text-muted-foreground">送らない</span>;
  }
  if (announcement.email_sent_at) {
    return (
      <span className="flex items-center gap-1 text-sm text-success">
        <MailCheck className="h-4 w-4" />
        送信済み（{formatDate(announcement.email_sent_at)}）
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Mail className="h-4 w-4" />
      {announcement.published_at ? "次回以降のバッチで送信" : "公開後に送信"}
    </span>
  );
}

export default async function ManageAnnouncementsPage() {
  const { data: announcements, error } = await fetchManageAnnouncements();
  const labels = {
    status: ANNOUNCEMENT_TARGET_STATUS_LABELS,
    membership: ANNOUNCEMENT_MEMBERSHIP_LABELS,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="お知らせ管理" description="受講生へのお知らせの作成・公開・メール送信" />
        <Button asChild>
          <Link href="/manage/announcements/new">
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            お知らせの取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      ) : !announcements || announcements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">お知らせはまだありません。</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>対象</TableHead>
                <TableHead className="w-28">公開</TableHead>
                <TableHead className="w-52">メール</TableHead>
                <TableHead className="text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((announcement) => (
                <TableRow key={announcement.id}>
                  <TableCell className="font-medium">{announcement.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {describeAnnouncementTargets(announcement, labels)}
                  </TableCell>
                  <TableCell>
                    {announcement.published_at ? (
                      <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                        <Eye className="h-3 w-3" />
                        {formatDate(announcement.published_at)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <EyeOff className="h-3 w-3" />
                        下書き
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <EmailStatus announcement={announcement} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" asChild title="編集">
                        <Link href={`/manage/announcements/${announcement.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        asChild
                        title="削除"
                        className="text-destructive hover:text-destructive"
                      >
                        <Link href={`/manage/announcements/${announcement.id}/delete`}>
                          <Trash2 className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
