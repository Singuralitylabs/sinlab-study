import { ClipboardList, Code, ExternalLink, Link as LinkIcon } from "lucide-react";
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
import { fetchAllSubmissionsWithReviews } from "@/app/services/api/ai-review-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatTokenCount(count: number | null): string {
  return count === null ? "-" : count.toLocaleString("ja-JP");
}

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return formatDateTimeMinute(dateString);
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ManageSubmissionsPage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const {
    data: submissions,
    count,
    error,
  } = await fetchAllSubmissionsWithReviews({
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
    redirect("/manage/submissions");
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageTitle title="提出一覧" description="全受講生の課題提出一覧" />
        <p className="text-destructive text-sm">提出一覧の取得に失敗しました。</p>
      </div>
    );
  }

  const totalPages = calcTotalPages(count, SUBMISSIONS_PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="提出一覧" description="全受講生の課題提出一覧" />

      {!submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">まだ提出がありません。</p>
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
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{submission.user?.display_name}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {submission.user?.email}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {formatDate(submission.submitted_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary" className="gap-1">
                    {submission.submission_type === "code" ? (
                      <Code className="h-3 w-3" />
                    ) : (
                      <LinkIcon className="h-3 w-3" />
                    )}
                    {submission.submission_type === "code" ? "コード提出" : "URL提出"}
                  </Badge>
                  <AIReviewStatusBadge review={submission.ai_review} />
                  <span className="min-w-0 break-words text-sm font-medium">
                    {submission.content?.title}
                  </span>
                </div>

                {submission.submission_type === "code" && (
                  <SubmissionCodeBlock
                    files={withFallbackLanguage(
                      getSubmissionCodeFiles(submission),
                      submission.content?.code_language
                    )}
                    preClassName="p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-40"
                  />
                )}

                {submission.submission_type === "url" &&
                  submission.url &&
                  (isValidUrl(submission.url) ? (
                    <a
                      href={submission.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full min-w-0 items-start gap-1 break-all text-primary hover:underline"
                    >
                      <span className="min-w-0">{submission.url}</span>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                    </a>
                  ) : (
                    <span className="block min-w-0 break-all text-sm text-muted-foreground">
                      {submission.url}
                    </span>
                  ))}

                {submission.ai_review && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    累計トークン数 — 入力: {formatTokenCount(submission.ai_review.prompt_tokens)} /
                    回答: {formatTokenCount(submission.ai_review.completion_tokens)} / 思考:{" "}
                    {formatTokenCount(submission.ai_review.thoughts_tokens)}
                  </p>
                )}

                {submission.ai_review && <AIReviewDisplayClient review={submission.ai_review} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SubmissionsPager basePath="/manage/submissions" page={page} totalPages={totalPages} />
    </div>
  );
}
