import { ClipboardList, Code, ExternalLink, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { AIReviewStatusBadge } from "@/app/components/AIReviewDisplay";
import { AIReviewDisplayClient } from "@/app/components/AIReviewDisplayClient";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchSubmissionsWithReviewsByUserId } from "@/app/services/api/ai-review-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SubmissionsPage() {
  const { userId } = await getServerAuth();

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">ユーザー情報を読み込み中...</p>
      </div>
    );
  }

  const { data: submissions } = await fetchSubmissionsWithReviewsByUserId(userId);

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="提出履歴" description="これまでに提出した課題の一覧です" />

      {!submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">まだ提出がありません。</p>
            <Button asChild className="mt-4">
              <Link href="/learn">学習を始める</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card
              key={submission.id}
              className="transition-all hover:shadow-md hover:border-primary/20"
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="secondary" className="gap-1">
                        {submission.submission_type === "code" ? (
                          <Code className="h-3 w-3" />
                        ) : (
                          <LinkIcon className="h-3 w-3" />
                        )}
                        {submission.submission_type === "code" ? "コード提出" : "URL提出"}
                      </Badge>
                      <AIReviewStatusBadge review={submission.ai_review} />
                      <span className="text-sm text-muted-foreground">
                        {formatDate(submission.submitted_at)}
                      </span>
                    </div>

                    <h3 className="font-medium">
                      {submission.content?.title || "不明なコンテンツ"}
                    </h3>

                    {submission.submission_type === "code" && submission.code_content && (
                      <pre className="mt-3 p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-40">
                        <code>{submission.code_content}</code>
                      </pre>
                    )}

                    {submission.submission_type === "url" && submission.url && (
                      <a
                        href={submission.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {submission.url}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}

                    {submission.ai_review && (
                      <AIReviewDisplayClient review={submission.ai_review} />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
