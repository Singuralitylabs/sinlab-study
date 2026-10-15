import { ClipboardList, Code, ExternalLink, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AIReviewDisplayClient } from "@/app/components/AIReviewDisplayClient";
import { AIReviewStatusBadge } from "@/app/components/AIReviewStatusBadge";
import { PageTitle } from "@/app/components/PageTitle";
import { SubmissionCodeBlock } from "@/app/components/SubmissionCodeBlock";
import { SubmissionsPager } from "@/app/components/SubmissionsPager";
import { SUBMISSIONS_PAGE_SIZE } from "@/app/constants/submissions";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";
import {
  calcTotalPages,
  parsePageParam,
  shouldRedirectOutOfRangePage,
} from "@/app/lib/submissions-pagination";
import { fetchSubmissionsWithReviewsByUserId } from "@/app/services/api/ai-review-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return formatDateTimeMinute(dateString);
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SubmissionsPage({ searchParams }: PageProps) {
  const { userId } = await getServerAuth();

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">ユーザー情報を読み込み中...</p>
      </div>
    );
  }

  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const {
    data: submissions,
    count,
    error,
  } = await fetchSubmissionsWithReviewsByUserId(userId, {
    page,
    pageSize: SUBMISSIONS_PAGE_SIZE,
  });

  if (
    shouldRedirectOutOfRangePage({
      page,
      dataLength: submissions?.length ?? 0,
      errorCode: error?.code,
    })
  ) {
    redirect("/submissions");
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageTitle title="提出履歴" description="これまでに提出した課題の一覧です" />
        <p className="text-destructive text-sm">提出履歴の取得に失敗しました。</p>
      </div>
    );
  }

  const totalPages = calcTotalPages(count, SUBMISSIONS_PAGE_SIZE);

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
              <CardContent className="min-w-0 pt-6">
                <div className="flex items-start justify-between gap-4">
                  {/* min-width:auto grows with the pre, so overflow-x-auto never starts a scrollport. */}
                  <div className="min-w-0 flex-1">
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

                    <h3 className="break-words font-medium">
                      {submission.content?.title || "不明なコンテンツ"}
                    </h3>

                    {submission.submission_type === "code" && (
                      <div className="mt-3">
                        <SubmissionCodeBlock
                          files={withFallbackLanguage(
                            getSubmissionCodeFiles(submission),
                            submission.content?.code_language
                          )}
                          preClassName="p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-40"
                        />
                      </div>
                    )}

                    {submission.submission_type === "url" && submission.url && (
                      <a
                        href={submission.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex max-w-full min-w-0 items-start gap-1 break-all text-primary hover:underline"
                      >
                        <span className="min-w-0">{submission.url}</span>
                        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
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

      <SubmissionsPager basePath="/submissions" page={page} totalPages={totalPages} />
    </div>
  );
}
