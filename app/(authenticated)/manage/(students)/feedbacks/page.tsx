import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/app/constants/feedback";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { fetchManageFeedbacks } from "@/app/services/api/feedback-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusVariant(status: FeedbackStatus): "default" | "secondary" | "outline" {
  if (status === "done") return "secondary";
  if (status === "in_progress") return "default";
  return "outline";
}

export default async function ManageFeedbacksPage() {
  const { data: feedbacks, error } = await fetchManageFeedbacks();

  return (
    <div className="max-w-5xl mx-auto">
      <PageTitle title="フィードバック" description="受講生からの不具合報告・改善要望・質問" />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            フィードバックの取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      ) : !feedbacks || feedbacks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">フィードバックはまだありません。</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>投稿者</TableHead>
                <TableHead>本文</TableHead>
                <TableHead className="w-40">受信日時</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedbacks.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/manage/feedbacks/${item.id}`}
                      className="text-primary hover:underline"
                    >
                      #{item.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {FEEDBACK_CATEGORY_LABELS[item.category as FeedbackCategory]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status as FeedbackStatus)}>
                      {FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.user?.display_name ?? "不明"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {item.body}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTimeMinute(item.created_at)}
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
