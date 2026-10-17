import { Bot, Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { LearningMemo } from "@/app/components/LearningMemo";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { SlideContent } from "@/app/components/SlideContent";
import { SubmissionCodeBlock } from "@/app/components/SubmissionCodeBlock";
import { UpgradeBenefitsList, UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { ANALYTICS_EVENT, UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { computeRemainingReviews } from "@/app/lib/ai-review-limits";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import { buildThemeContentOrder, resolveContentNavigation } from "@/app/lib/content-navigation";
import { isExerciseRetryInProgress } from "@/app/lib/exercise-retry";
import { resolveMarkdownStorageUrls } from "@/app/lib/storage-url";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";
import { getLockedContentFallbackOverview } from "@/app/lib/trial-upgrade";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import { fetchCompletedAIReviewByContentId } from "@/app/services/api/ai-review-server";
import { fetchAIReviewUsage } from "@/app/services/api/ai-review-usage-server";
import {
  fetchContentById,
  fetchContentRequiresReviewPass,
  fetchContentReviewPassUnachievable,
  fetchExerciseReferenceAnswer,
  fetchThemeNavigationIndex,
  fetchUserHasPassingReview,
  fetchUserProgressByContentId,
  fetchWeekById,
  isContentFullyPublished,
  isContentLockedForUser,
  isWeekHierarchyPublished,
} from "@/app/services/api/learning-server";
import { fetchQuizQuestions } from "@/app/services/api/quiz-server";
import { fetchReviewNotesForContent } from "@/app/services/api/review-list-server";
import { createSlideSignedUrl } from "@/app/services/api/slides-server";
import { fetchLatestSubmissionByContentId } from "@/app/services/api/submissions-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { checkContentPermissions, isLearnerRole } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AIReviewLimitNotice } from "./AIReviewLimitNotice";
import { CompleteButton } from "./CompleteButton";
import { ExerciseCompletionStatus } from "./ExerciseCompletionStatus";
import { ExerciseRetryButton } from "./ExerciseRetryButton";
import { PrevNextNav } from "./PrevNextNav";
import { QuizForm } from "./QuizForm";
import { RecordContentView } from "./RecordContentView";
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
  const showReviewListNotes = isLearnerRole(userRole);

  // Started before the other fetches so a slow Stripe call overlaps them instead of adding to them.
  // Never rejects (falls back internally), so an unawaited promise is safe.
  const stripeEnabled = isStripeEnabled();
  const priceLabelPromise =
    stripeEnabled && userStatus === USER_STATUS.TRIAL
      ? fetchUpgradePriceLabel()
      : Promise.resolve(null);

  // Members/trial users fetch the summary via service_role; admin/maintainer use the normal client so
  // unpublished content is included. Progress needs only the IDs (RLS-scoped client), so it runs
  // in this first wave instead of waiting for content_type.
  const [{ data: navigation }, { data: content }, { isCompleted, retryStartedAt }] =
    await Promise.all([
      fetchThemeNavigationIndex(themeIdNum, weekIdNum, userRole),
      fetchContentById(contentIdNum, userRole),
      userId
        ? fetchUserProgressByContentId(userId, contentIdNum)
        : Promise.resolve({ isCompleted: false, retryStartedAt: null }),
    ]);

  // The breadcrumb hierarchy comes from the content's embedded week -> phase -> theme. Locked
  // trial content is hidden from the content query by RLS (content is null), so only then is the
  // week fetched separately (the lock screen still needs its breadcrumbs).
  const week = content ? content.week : (await fetchWeekById(weekIdNum, userRole)).data;

  // 404 when the URL's themeId/phaseId don't match the week's actual phase/theme (keeps breadcrumbs
  // and prev/next links from pointing at wrong URLs).
  // The embedded week has no is_deleted filter (fetchWeekById had), so a deleted week is rejected
  // here for admin / maintainer too instead of showing up as a preview.
  if (
    !week ||
    week.is_deleted ||
    week.id !== weekIdNum ||
    week.phase_id !== phaseIdNum ||
    week.phase?.theme_id !== themeIdNum
  ) {
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
    // No description lookup on purpose: RLS returns 0 rows for trial-locked content, so it could
    // never show, and widening the service_role allow-list would break the AGENTS.md invariant.
    // The counts reuse the navigation summaries, so no new service_role call is added.
    const priceLabel = await priceLabelPromise;
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

  const showsAIReviewLimit =
    Boolean(userId) &&
    content.content_type === "exercise" &&
    isFullyPublished &&
    (userStatus === USER_STATUS.ACTIVE || userStatus === USER_STATUS.TRIAL);
  // Trial notice is a fixed message and does not read `remaining`, so the usage query is wasted.
  const countsAIReviewUsage = showsAIReviewLimit && userStatus === USER_STATUS.ACTIVE;

  // Issue the slide signed URL only after the lock check (isLocked) and the RLS-applied
  // fetchContentById() pass; locked or unpublished content (except admin/maintainer preview) never
  // gets here (#89). Runs in parallel with the progress fetches. The remaining-review count is
  // computed here on the server (the client never counts) and joins the same Promise.all because
  // it depends on none of the other fetches.
  const exerciseContent = content.content_type === "exercise";
  const [
    { data: existingReview, submissionId: reviewedSubmissionId },
    { data: latestSubmission },
    { data: referenceAnswer },
    slideSignedUrl,
    { data: quizQuestions, error: quizError },
    aiReviewUsage,
    { data: reviewNotes },
    requiresReviewPass,
    passUnachievable,
    hasPassingReview,
  ] = await Promise.all([
    userId && exerciseContent
      ? fetchCompletedAIReviewByContentId(userId, contentIdNum)
      : Promise.resolve({ data: null, submissionId: null }),
    // service_role read: only after the lock / publish checks above, and only for exercises.
    userId && exerciseContent
      ? fetchLatestSubmissionByContentId(userId, contentIdNum)
      : Promise.resolve({ data: null }),
    // The RPC returns the answer only to a caller who has submitted (or admin / maintainer), so
    // it is safe to ask without waiting for the submission lookup.
    userId && exerciseContent
      ? fetchExerciseReferenceAnswer(contentIdNum)
      : Promise.resolve({ data: null }),
    content.content_type === "slide" && content.pdf_url
      ? createSlideSignedUrl(content.pdf_url)
      : Promise.resolve(null),
    content.content_type === "quiz"
      ? fetchQuizQuestions(contentIdNum)
      : Promise.resolve({ data: [], error: null }),
    countsAIReviewUsage && userId !== null
      ? createServerSupabaseClient().then((supabase) =>
          fetchAIReviewUsage(supabase, {
            userId,
            contentId: contentIdNum,
            includeDailyTotal: true,
          })
        )
      : Promise.resolve(null),
    showReviewListNotes && userId
      ? fetchReviewNotesForContent(userId, contentIdNum)
      : Promise.resolve({ data: [] }),
    exerciseContent ? fetchContentRequiresReviewPass(contentIdNum) : Promise.resolve(false),
    exerciseContent ? fetchContentReviewPassUnachievable(contentIdNum) : Promise.resolve(false),
    exerciseContent && userId
      ? fetchUserHasPassingReview(userId, contentIdNum)
      : Promise.resolve(false),
  ]);

  const memosByKey: Record<string, string | null> = {};
  let freeLearningMemo: string | null = null;
  if (showReviewListNotes) {
    for (const note of reviewNotes) {
      if (note.requirement_key === null) {
        freeLearningMemo = note.memo;
      } else {
        memosByKey[note.requirement_key] = note.memo;
      }
    }
  }

  // A failed lookup hides only the remaining count, not the notice.
  const aiReviewRemaining =
    showsAIReviewLimit && aiReviewUsage
      ? computeRemainingReviews({
          userStatus,
          contentReviews: aiReviewUsage.contentReviews,
          todayTotal: aiReviewUsage.todayTotal,
          now: new Date(),
        })
      : null;

  // The completed-review query is the newest submission that has one, which can be older than
  // the latest submission. Showing it under the newer code would present the old score as this one.
  const reviewForLatestSubmission =
    existingReview && latestSubmission && reviewedSubmissionId === latestSubmission.id
      ? existingReview
      : null;

  const isRetrying = isExerciseRetryInProgress({
    latestSubmittedAt: latestSubmission?.submitted_at,
    retryStartedAt,
  });
  // During retry, hide the model answer / AI review; only pass a review id the page actually draws.
  const visibleReview = isRetrying ? null : reviewForLatestSubmission;
  const showReferenceAnswer = Boolean(referenceAnswer) && !isRetrying;
  // Submitted + not retrying: hide the editor until "再度課題に取り組む" (#406). Keep the form
  // mounted so a client AI review after submit is not torn down by router.refresh().
  const showSubmissionEditor = !latestSubmission || isRetrying;

  return (
    <div className="max-w-4xl mx-auto">
      {userId ? <RecordContentView contentId={contentIdNum} /> : null}
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

          {content.content_type === "slide" && (
            <>
              {content.pdf_url && (
                <div className={content.text_content ? "mb-6" : undefined}>
                  <SlideContent signedUrl={slideSignedUrl} />
                </div>
              )}
              {content.text_content && (
                <MarkdownRenderer content={resolveMarkdownStorageUrls(content.text_content)} />
              )}
            </>
          )}

          {content.content_type === "quiz" && (
            <div className="space-y-6">
              {content.description && (
                <MarkdownRenderer content={resolveMarkdownStorageUrls(content.description)} />
              )}
              {quizError ? (
                <p className="text-sm text-muted-foreground">
                  クイズの設問を読み込めませんでした。時間をおいて再度お試しください。
                </p>
              ) : (
                <QuizForm
                  contentId={contentIdNum}
                  questions={quizQuestions.map((question) => ({
                    ...question,
                    question: <MarkdownRenderer content={question.question} />,
                    choices: question.choices.map((choice, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: choices are fixed per question and may repeat
                      <MarkdownRenderer key={index} content={choice} className="[&>*]:my-0" />
                    )),
                  }))}
                  canRecordProgress={Boolean(userId) && isFullyPublished}
                  initialCompleted={isCompleted}
                />
              )}
            </div>
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
                      {isRetrying ? (
                        <>
                          <p className="mb-4 text-sm text-muted-foreground">
                            再挑戦中です。新しく提出すると模範回答と AI レビュー結果が表示されます
                          </p>
                          <details className="mb-6 rounded-lg border border-border">
                            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-2">
                              前回の提出内容を見る
                            </summary>
                            <div className="border-t border-border px-4 py-3">
                              {latestSubmission.submission_type === "code" ? (
                                <SubmissionCodeBlock
                                  files={withFallbackLanguage(
                                    getSubmissionCodeFiles(latestSubmission),
                                    content.code_language
                                  )}
                                  previewSource={{
                                    submissionFileSlots: content.submission_file_slots,
                                    starterFiles: content.starter_files,
                                    codeLanguage: content.code_language,
                                    previewBaseHtml: content.preview_base_html,
                                    showPreview: content.show_preview,
                                    showConsole: content.show_console,
                                  }}
                                  preClassName="rounded-lg bg-muted px-4 py-3 text-sm font-mono overflow-x-auto"
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground break-all">
                                  {latestSubmission.url}
                                </p>
                              )}
                            </div>
                          </details>
                        </>
                      ) : (
                        <>
                          <div className="mb-6">
                            <h3 className="text-lg font-semibold mb-3">提出内容</h3>
                            {latestSubmission.submission_type === "code" ? (
                              <SubmissionCodeBlock
                                files={withFallbackLanguage(
                                  getSubmissionCodeFiles(latestSubmission),
                                  content.code_language
                                )}
                                previewSource={{
                                  submissionFileSlots: content.submission_file_slots,
                                  starterFiles: content.starter_files,
                                  codeLanguage: content.code_language,
                                  previewBaseHtml: content.preview_base_html,
                                  showPreview: content.show_preview,
                                  showConsole: content.show_console,
                                }}
                                preClassName="rounded-lg bg-muted px-4 py-3 text-sm font-mono overflow-x-auto"
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground break-all">
                                {latestSubmission.url}
                              </p>
                            )}
                          </div>

                          {showReferenceAnswer && (
                            <div className="mb-6">
                              <h3 className="text-lg font-semibold mb-3">模範回答</h3>
                              {/* Free text from the admin textarea. pre-wrap keeps a long sentence
                                  on the card. Submission code omits it so a line scrolls inside pre. */}
                              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-sm font-mono">
                                {referenceAnswer}
                              </pre>
                            </div>
                          )}

                          {visibleReview && (
                            <div className="mb-6">
                              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                                <h3 className="text-lg font-semibold">AIレビュー結果</h3>
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-primary/40 text-primary"
                                >
                                  <Bot className="h-3 w-3" />
                                  AIレビュー済み
                                </Badge>
                              </div>
                              <AIReviewDisplayNoSSR
                                review={visibleReview}
                                defaultExpanded={false}
                                contentId={showReviewListNotes ? contentIdNum : undefined}
                                memosByKey={showReviewListNotes ? memosByKey : undefined}
                              />
                            </div>
                          )}

                          {isFullyPublished && <ExerciseRetryButton contentId={contentIdNum} />}
                        </>
                      )}

                      <Separator className="mb-6" />
                    </>
                  )}

                  {isFullyPublished ? (
                    <>
                      {showSubmissionEditor && (
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                          <h3 className="text-lg font-semibold">課題提出</h3>
                          <AIReviewLimitNotice
                            userStatus={userStatus}
                            remaining={aiReviewRemaining}
                            stripeEnabled={isStripeEnabled()}
                          />
                        </div>
                      )}
                      <SubmissionForm
                        contentId={contentIdNum}
                        allowedSubmissionTypes={
                          (content.allowed_submission_types as "code" | "url" | "both") ?? "code"
                        }
                        codeLanguage={(content.code_language as CodeLanguage) ?? "javascript"}
                        starterFiles={parseStarterFiles(content.starter_files)}
                        submissionFileSlots={content.submission_file_slots}
                        previewBaseHtml={content.preview_base_html}
                        showPreview={content.show_preview}
                        showConsole={content.show_console}
                        persistedReviewId={visibleReview?.id ?? null}
                        showReviewListNotes={showReviewListNotes}
                        showEditor={showSubmissionEditor}
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
          {exerciseContent && requiresReviewPass ? (
            <ExerciseCompletionStatus
              key={String(isCompleted)}
              contentId={contentIdNum}
              initialCompleted={isCompleted}
              hasPassingReview={hasPassingReview}
              passUnachievable={passUnachievable}
              userStatus={userStatus}
              allowsUrlSubmission={
                ((content.allowed_submission_types as "code" | "url" | "both" | null) ?? "code") !==
                "code"
              }
            />
          ) : (
            // Keyed by the saved state so router.refresh() after a quiz answer remounts it.
            <CompleteButton
              key={String(isCompleted)}
              contentId={contentIdNum}
              initialCompleted={isCompleted}
              refreshOnToggle={content.content_type === "quiz"}
            />
          )}
        </div>
      )}

      {showReviewListNotes && userId && isFullyPublished && (
        <LearningMemo contentId={contentIdNum} initialMemo={freeLearningMemo} />
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
