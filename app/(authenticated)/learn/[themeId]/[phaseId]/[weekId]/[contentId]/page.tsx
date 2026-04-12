import { Bot, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { fetchCompletedAIReviewByContentId } from "@/app/services/api/ai-review-server";
import {
  fetchContentById,
  fetchContentsByWeekId,
  fetchUserProgressByContentId,
} from "@/app/services/api/learning-server";
import { fetchLatestSubmissionByContentId } from "@/app/services/api/submissions-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CompleteButton } from "./CompleteButton";
import { SubmissionForm } from "./SubmissionForm";

interface PageProps {
  params: Promise<{ themeId: string; phaseId: string; weekId: string; contentId: string }>;
}

export default async function ContentPage({ params }: PageProps) {
  const { themeId, phaseId, weekId, contentId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);
  const weekIdNum = Number.parseInt(weekId, 10);
  const contentIdNum = Number.parseInt(contentId, 10);

  if (
    Number.isNaN(themeIdNum) ||
    Number.isNaN(phaseIdNum) ||
    Number.isNaN(weekIdNum) ||
    Number.isNaN(contentIdNum)
  ) {
    notFound();
  }

  const { userId } = await getServerAuth();
  const { data: content } = await fetchContentById(contentIdNum);

  if (!content || content.week_id !== weekIdNum) {
    notFound();
  }

  const { data: weekContents } = await fetchContentsByWeekId(weekIdNum);
  const currentIndex = weekContents?.findIndex((c) => c.id === contentIdNum) ?? -1;
  const prevContent = currentIndex > 0 ? weekContents?.[currentIndex - 1] : null;
  const nextContent =
    currentIndex >= 0 && currentIndex < (weekContents?.length ?? 0) - 1
      ? weekContents?.[currentIndex + 1]
      : null;

  const [{ isCompleted }, { data: existingReview }, { data: latestSubmission }] = await Promise.all(
    [
      userId
        ? fetchUserProgressByContentId(userId, contentIdNum)
        : Promise.resolve({ isCompleted: false }),
      userId && content.content_type === "exercise"
        ? fetchCompletedAIReviewByContentId(userId, contentIdNum)
        : Promise.resolve({ data: null }),
      userId && content.content_type === "exercise"
        ? fetchLatestSubmissionByContentId(userId, contentIdNum)
        : Promise.resolve({ data: null }),
    ]
  );

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={content.title}
        breadcrumbs={[
          { label: "学習コンテンツ", href: "/learn" },
          {
            label: content.week?.phase?.theme?.name || "テーマ",
            href: `/learn/${themeIdNum}`,
          },
          {
            label: content.week?.phase?.name || "フェーズ",
            href: `/learn/${themeIdNum}/${phaseIdNum}`,
          },
          { label: content.title },
        ]}
      />

      {/* コンテンツ本体 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {content.content_type === "video" && content.video_url && (
            <div className="mb-6">
              <YouTubeEmbed url={content.video_url} />
            </div>
          )}

          {content.content_type === "text" && content.text_content && (
            <MarkdownRenderer
              content={content.text_content.replace(
                /\{\{SUPABASE_STORAGE_URL\}\}/g,
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`
              )}
            />
          )}

          {content.content_type === "slide" && content.pdf_url && (
            <PdfSlideViewer
              url={
                /^https?:\/\//.test(content.pdf_url)
                  ? content.pdf_url
                  : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${content.pdf_url}`
              }
            />
          )}

          {content.content_type === "exercise" && content.exercise_instructions && (
            <div>
              <MarkdownRenderer content={content.exercise_instructions} />

              {content.hint && (
                <details className="mt-4 rounded-lg border border-border">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-2">
                    <span className="text-base">💡</span>
                    ヒントを見る
                  </summary>
                  <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {content.hint}
                  </div>
                </details>
              )}

              {userId && (
                <div className="mt-8">
                  <Separator className="mb-6" />

                  {/* 提出済み: 提出内容・模範回答・AIレビュー結果 */}
                  {latestSubmission && (
                    <>
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3">提出内容</h3>
                        {latestSubmission.submission_type === "code" ? (
                          <pre className="rounded-lg bg-muted px-4 py-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                            {latestSubmission.code_content}
                          </pre>
                        ) : (
                          <p className="text-sm text-muted-foreground break-all">
                            {latestSubmission.url}
                          </p>
                        )}
                      </div>

                      {content.reference_answer && (
                        <div className="mb-6">
                          <h3 className="text-lg font-semibold mb-3">模範回答</h3>
                          <pre className="rounded-lg bg-muted px-4 py-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                            {content.reference_answer}
                          </pre>
                        </div>
                      )}

                      {existingReview && (
                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">AIレビュー結果</h3>
                            <Badge
                              variant="outline"
                              className="gap-1 border-primary/40 text-primary"
                            >
                              <Bot className="h-3 w-3" />
                              AIレビュー済み
                            </Badge>
                          </div>
                          <AIReviewDisplay review={existingReview} defaultExpanded={false} />
                        </div>
                      )}

                      <Separator className="mb-6" />
                    </>
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">課題提出</h3>
                    <span className="text-xs text-muted-foreground">
                      ※ AIレビューは1コンテンツにつき1回のみ利用可能です
                    </span>
                  </div>
                  <SubmissionForm
                    contentId={contentIdNum}
                    userId={userId}
                    allowedSubmissionTypes={
                      (content.allowed_submission_types as "code" | "url" | "both") ?? "code"
                    }
                    codeLanguage={
                      (content.code_language as "javascript" | "typescript" | "html" | "css") ??
                      "javascript"
                    }
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 完了ボタン */}
      {userId && (
        <div className="mb-6">
          <CompleteButton contentId={contentIdNum} userId={userId} initialCompleted={isCompleted} />
        </div>
      )}

      {/* 前後ナビゲーション */}
      <div className="flex items-center justify-between gap-4">
        {prevContent ? (
          <Button variant="outline" asChild className="flex-1 justify-start">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}/${weekIdNum}/${prevContent.id}`}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="truncate">{prevContent.title}</span>
            </Link>
          </Button>
        ) : (
          <div className="flex-1" />
        )}

        {nextContent ? (
          <Button variant="outline" asChild className="flex-1 justify-end">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}/${weekIdNum}/${nextContent.id}`}>
              <span className="truncate">{nextContent.title}</span>
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        ) : (
          <Button asChild className="flex-1 justify-center">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}`}>フェーズに戻る</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
