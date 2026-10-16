import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/app/constants/feedback";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchManageFeedbackById } from "@/app/services/api/feedback-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackStatusForm } from "./FeedbackStatusForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManageFeedbackDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = parsePositiveInteger(rawId);
  if (!id) {
    notFound();
  }

  const { data: feedback, error } = await fetchManageFeedbackById(id);
  if (error || !feedback) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageTitle
          title={`フィードバック #${feedback.id}`}
          description={FEEDBACK_CATEGORY_LABELS[feedback.category as FeedbackCategory]}
        />
        <Button asChild variant="outline">
          <Link href="/manage/feedbacks">一覧へ戻る</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">投稿者</p>
            <p>
              {feedback.user?.display_name ?? "不明"}
              {feedback.user?.email ? `（${feedback.user.email}）` : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">受信日時</p>
            <p>{formatDateTimeMinute(feedback.created_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">ページ URL</p>
            <p className="break-all">{feedback.page_url ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">User-Agent</p>
            <p className="break-all text-muted-foreground">{feedback.user_agent ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">本文</p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-sans">
              {feedback.body}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FeedbackStatusForm
            feedbackId={feedback.id}
            initialStatus={feedback.status as FeedbackStatus}
          />
        </CardContent>
      </Card>
    </div>
  );
}
