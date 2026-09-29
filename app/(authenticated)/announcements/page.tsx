import { Megaphone } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { formatDate } from "@/app/lib/format-date";
import { getViewerAnnouncements } from "@/app/services/api/announcements-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function AnnouncementsPage() {
  const { data: announcements, error } = await getViewerAnnouncements();

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle title="お知らせ" description="運営からのお知らせ" />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            お知らせの取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      ) : !announcements || announcements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>お知らせはまだありません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {announcements.map((announcement) => (
            <Link
              key={announcement.id}
              href={`/announcements/${announcement.id}`}
              className="block group"
            >
              <Card className="transition-all hover:shadow-md hover:border-primary/20">
                <CardContent className="flex items-center gap-3 py-4">
                  <Megaphone className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate group-hover:text-primary ${announcement.isRead ? "" : "font-semibold"}`}
                    >
                      {announcement.title}
                    </p>
                    {announcement.published_at && (
                      <p className="text-sm text-muted-foreground">
                        {formatDate(announcement.published_at)}
                      </p>
                    )}
                  </div>
                  {!announcement.isRead && <Badge>未読</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
