import { Bot, Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { SlideContent } from "@/app/components/SlideContent";
import { SubmissionCodeBlock } from "@/app/components/SubmissionCodeBlock";
import { UpgradeBenefitsList, UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { ANALYTICS_EVENT, UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { isStripeEnabled } from "@/app/constants/stripe";
import { buildThemeContentOrder, resolveContentNavigation } from "@/app/lib/content-navigation";
import { resolveMarkdownStorageUrls } from "@/app/lib/storage-url";
import { getSubmissionCodeFiles } from "@/app/lib/submission-files";
import { getLockedContentFallbackOverview } from "@/app/lib/trial-upgrade";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import { fetchCompletedAIReviewByContentId } from "@/app/services/api/ai-review-server";
import {
  fetchContentById,
  fetchThemeNavigationIndex,
  fetchUserProgressByContentId,
  fetchWeekById,
  isContentFullyPublished,
  isContentLockedForUser,
  isWeekHierarchyPublished,
} from "@/app/services/api/learning-server";
import { createSlideSignedUrl } from "@/app/services/api/slides-server";
import { fetchLatestSubmissionByContentId } from "@/app/services/api/submissions-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CompleteButton } from "./CompleteButton";
import { PrevNextNav } from "./PrevNextNav";
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

  const { userId, userStatus, userRole } = await getServerAuth();

  // Members/trial users fetch the summary via service_role; admin/maintainer use the normal client so
  // unpublished content is included.
  const [{ data: week }, { data: navigation }, { data: content }] = await Promise.all([
    fetchWeekById(weekIdNum, userRole),
    fetchThemeNavigationIndex(themeIdNum, weekIdNum, userRole),
    fetchContentById(contentIdNum, userRole),
  ]);

  // 404 when the URL's themeId/phaseId don't match the week's actual phase/theme (keeps breadcrumbs
  // and prev/next links from pointing at wrong URLs).
  if (!week || week.phase_id !== phaseIdNum || week.phase?.theme_id !== themeIdNum) {
    notFound();
  }

  const weekContentSummaries = navigation?.currentWeekContents;
  const summary = weekContentSummaries?.find((c) => c.id === contentIdNum);

  if (!summary) {
    notFound();
  }

  // For members/trial users, 404 before the lock check if any parent (week/phase/theme) is
  // unpublished or deleted. The summary goes through service_role and only sees the content row's
  // is_published, so rendering the lock screen first would leak titles/breadcrumbs under an
  // unpublished theme (#242).
  if (!checkContentPermissions(userRole) && !isWeekHierarchyPublished(week)) {
    notFound();
  }

  const weekLocalContents =
    week.phase != null
      ? buildThemeContentOrder(
          [
            {
              id: week.id,
              name: week.name,
              display_order: week.display_order,
              phase: {
                id: week.phase.id,
                name: week.phase.name,
                display_order: null,
              },
            },
          ],
          weekContentSummaries ?? []
        )
      : [];
  const { prev, next, endFallback } = resolveContentNavigation(
    navigation?.orderedContents ?? [],
    contentIdNum,
    weekLocalContents
  );

  const isLocked = isContentLockedForUser(userStatus, summary.is_open_to_trial);

  if (isLocked) {
    const stripeEnabled = isStripeEnabled();
    // No description lookup on purpose: RLS returns 0 rows for trial-locked content, so it could
    // never show, and widening the service_role allow-list would break the AGENTS.md invariant.
    // The counts reuse the navigation summaries, so no new service_role call is added.
    const priceLabel = stripeEnabled ? await fetchUpgradePriceLabel() : null;
    const paidOnlyCount = navigation?.paidOnlyCount ?? 0;
    const paidOnlyExerciseCount = navigation?.paidOnlyExerciseCount ?? 0;

    trackServerEvent(ANALYTICS_EVENT.LOCKED_CONTENT_VIEWED, {
      content_type: summary.content_type,
    });

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
          <CardContent className="py-8 space-y-6">
            <div className="text-center">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                このコンテンツは無料プランでは閲覧できません。
                <br />
                本登録後に閲覧・提出できるようになります。
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">概要</h2>
              <p className="text-sm">{getLockedContentFallbackOverview(summary.content_type)}</p>
            </div>

            {paidOnlyCount > 0 && (
              <p className="text-sm">
                このテーマには有料会員向けのコンテンツが{paidOnlyCount}件（うち演習
                {paidOnlyExerciseCount}件）あります
              </p>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                有料会員になると使えるもの
              </h2>
              <UpgradeBenefitsList />
              <UpgradeCta
                stripeEnabled={stripeEnabled}
                priceLabel={priceLabel}
                source={UPGRADE_CTA_SOURCE.LOCK_SCREEN}
              />
            </div>
          </CardContent>
        </Card>

        <PrevNextNav
          themeId={themeIdNum}
          phaseId={phaseIdNum}
          prev={prev}
          next={next}
          endFallback={endFallback}
        />
      </div>
    );
  }

  if (!content || content.week_id !== weekIdNum) {
    notFound();
  }

  // Even when the content row is published, an unpublished/deleted week/phase/theme makes it a
  // preview (badge, completion button/submission form availability); members/trial users get 404
  // (#216). They are already rejected by the guard before the lock check (#242), so this
  // re-verifies the same condition via the embedded content row as a second layer.
  const isFullyPublished = isContentFullyPublished(content);
  if (!isFullyPublished && !checkContentPermissions(userRole)) {
    notFound();
  }

  // Issue the slide signed URL only after the lock check (isLocked) and the RLS-applied
  // fetchContentById() pass; locked or unpublished content (except admin/maintainer preview) never
  // gets here (#89). Runs in parallel with the progress fetches.
  const [{ isCompleted }, { data: existingReview }, { data: latestSubmission }, slideSignedUrl] =
    await Promise.all([
      userId
        ? fetchUserProgressByContentId(userId, contentIdNum)
        : Promise.resolve({ isCompleted: false }),
      userId && content.content_type === "exercise"
        ? fetchCompletedAIReviewByContentId(userId, contentIdNum)
        : Promise.resolve({ data: null }),
      userId && content.content_type === "exercise"
        ? fetchLatestSubmissionByContentId(userId, contentIdNum)
        : Promise.resolve({ data: null }),
      content.content_type === "slide" && content.pdf_url
        ? createSlideSignedUrl(content.pdf_url)
        : Promise.resolve(null),
    ]);

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
            <SlideContent signedUrl={slideSignedUrl} />
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
                          <AIReviewDisplayNoSSR review={existingReview} defaultExpanded={false} />
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

      {(content.content_type === "video" || content.content_type === "slide") &&
        content.description && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-2">概要</h2>
              <MarkdownRenderer content={resolveMarkdownStorageUrls(content.description)} />
            </CardContent>
          </Card>
        )}

      {/* Hidden while previewing unpublished content since progress can't be recorded. */}
      {userId && isFullyPublished && (
        <div className="mb-6">
          <CompleteButton contentId={contentIdNum} initialCompleted={isCompleted} />
        </div>
      )}

      <PrevNextNav
        themeId={themeIdNum}
        phaseId={phaseIdNum}
        prev={prev}
        next={next}
        endFallback={endFallback}
      />
    </div>
  );
}
