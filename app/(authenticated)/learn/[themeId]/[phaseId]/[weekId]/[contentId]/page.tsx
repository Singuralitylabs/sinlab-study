import { Bot, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import type { CodeLanguage } from "@/app/components/CodeEditor";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";
import { SubmissionCodeBlock } from "@/app/components/SubmissionCodeBlock";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { resolveMarkdownStorageUrls } from "@/app/lib/storage-url";
import { getSubmissionCodeFiles } from "@/app/lib/submission-files";
import { fetchCompletedAIReviewByContentId } from "@/app/services/api/ai-review-server";
import {
  type ContentVisibilitySummary,
  fetchContentById,
  fetchContentSummariesByWeekIds,
  fetchUserProgressByContentId,
  fetchWeekById,
  isContentFullyPublished,
  isContentLockedForUser,
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

function PrevNextNav({
  themeIdNum,
  phaseIdNum,
  weekIdNum,
  prevContent,
  nextContent,
}: {
  themeIdNum: number;
  phaseIdNum: number;
  weekIdNum: number;
  prevContent: ContentVisibilitySummary | null;
  nextContent: ContentVisibilitySummary | null;
}) {
  return (
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
  );
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

  const { userId, userStatus, userRole } = await getServerAuth();

  // 存在チェック + ロック判定用のサマリーを取得
  // （member / お試しユーザーは service_role、admin / maintainer は通常クライアントで未公開分も取得）
  const [{ data: week }, { data: weekContentSummaries }] = await Promise.all([
    fetchWeekById(weekIdNum, userRole),
    fetchContentSummariesByWeekIds([weekIdNum], userRole),
  ]);

  // URLの themeId/phaseId が実際の週の所属フェーズ・テーマと一致しない場合は404
  // （パンくず・前後リンクが誤ったURLになるのを防ぐ）
  if (!week || week.phase_id !== phaseIdNum || week.phase?.theme_id !== themeIdNum) {
    notFound();
  }

  const summary = weekContentSummaries?.find((c) => c.id === contentIdNum);

  // 公開コンテンツとして存在しない（未公開・論理削除済み・他の週所属を含む）場合は404
  if (!summary) {
    notFound();
  }

  const currentIndex = weekContentSummaries?.findIndex((c) => c.id === contentIdNum) ?? -1;
  const prevContent = currentIndex > 0 ? (weekContentSummaries?.[currentIndex - 1] ?? null) : null;
  const nextContent =
    currentIndex >= 0 && currentIndex < (weekContentSummaries?.length ?? 0) - 1
      ? (weekContentSummaries?.[currentIndex + 1] ?? null)
      : null;

  const isLocked = isContentLockedForUser(userStatus, summary.is_open_to_trial);

  if (isLocked) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageTitle
          title={summary.title}
          breadcrumbs={[
            { label: "学習コンテンツ", href: "/learn" },
            { label: week.phase?.theme?.name || "テーマ", href: `/learn/${themeIdNum}` },
            {
              label: week.phase?.name || "フェーズ",
              href: `/learn/${themeIdNum}/${phaseIdNum}`,
            },
            { label: summary.title },
          ]}
          badge={<UnpublishedBadge isPublished={summary.is_published} />}
        />

        <Card className="mb-6">
          <CardContent className="py-12 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              このコンテンツは無料プランでは閲覧できません。
              <br />
              本登録後に閲覧・提出できるようになります。
            </p>
          </CardContent>
        </Card>

        <PrevNextNav
          themeIdNum={themeIdNum}
          phaseIdNum={phaseIdNum}
          weekIdNum={weekIdNum}
          prevContent={prevContent}
          nextContent={nextContent}
        />
      </div>
    );
  }

  const { data: content } = await fetchContentById(contentIdNum, userRole);

  if (!content || content.week_id !== weekIdNum) {
    notFound();
  }

  // コンテンツ行自体が公開済みでも、所属する週・フェーズ・テーマのいずれかが未公開なら
  // プレビュー扱いとする（バッジ表示・完了ボタン/提出フォームの表示可否に使う）。
  const isFullyPublished = isContentFullyPublished(content);

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
        badge={<UnpublishedBadge isPublished={isFullyPublished} />}
      />

      {/* 概要欄（video / slide かつ概要が入力されている場合のみ表示） */}
      {(content.content_type === "video" || content.content_type === "slide") &&
        content.description && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">概要</h2>
              <MarkdownRenderer content={resolveMarkdownStorageUrls(content.description)} />
            </CardContent>
          </Card>
        )}

      {/* コンテンツ本体 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {content.content_type === "video" && content.video_url && (
            <div className="mb-6">
              <YouTubeEmbed url={content.video_url} />
            </div>
          )}

          {content.content_type === "text" && content.text_content && (
            <MarkdownRenderer content={resolveMarkdownStorageUrls(content.text_content)} />
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
                          <SubmissionCodeBlock
                            files={getSubmissionCodeFiles(latestSubmission)}
                            preClassName="rounded-lg bg-muted px-4 py-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap"
                          />
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

                  {isFullyPublished ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">課題提出</h3>
                        <span className="text-xs text-muted-foreground">
                          ※ AIレビューは1コンテンツにつき1回のみ利用可能です
                        </span>
                      </div>
                      <SubmissionForm
                        contentId={contentIdNum}
                        allowedSubmissionTypes={
                          (content.allowed_submission_types as "code" | "url" | "both") ?? "code"
                        }
                        codeLanguage={(content.code_language as CodeLanguage) ?? "javascript"}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      非公開コンテンツのプレビュー中は課題提出・AIレビューを利用できません。
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 完了ボタン（未公開コンテンツのプレビュー中は進捗登録できないため非表示） */}
      {userId && isFullyPublished && (
        <div className="mb-6">
          <CompleteButton contentId={contentIdNum} initialCompleted={isCompleted} />
        </div>
      )}

      {/* 前後ナビゲーション */}
      <PrevNextNav
        themeIdNum={themeIdNum}
        phaseIdNum={phaseIdNum}
        weekIdNum={weekIdNum}
        prevContent={prevContent}
        nextContent={nextContent}
      />
    </div>
  );
}
