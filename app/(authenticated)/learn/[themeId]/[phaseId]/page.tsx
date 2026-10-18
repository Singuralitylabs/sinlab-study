import { BookOpen, Bot, CheckCircle, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { PageTitle } from "@/app/components/PageTitle";
import { UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { CONTENT_TYPE_LABELS } from "@/app/constants/content";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { fetchCompletedAIReviewContentIds } from "@/app/services/api/ai-review-server";
import {
  type ContentVisibilitySummary,
  fetchContentSummariesByPhaseId,
  fetchPhaseById,
  fetchThemeById,
  fetchUserProgressByContentIds,
  isContentLockedForUser,
} from "@/app/services/api/learning-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PageProps {
  params: Promise<{ themeId: string; phaseId: string }>;
}

export default async function PhasePage({ params }: PageProps) {
  const { themeId, phaseId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);

  if (Number.isNaN(themeIdNum) || Number.isNaN(phaseIdNum)) {
    notFound();
  }

  const { userId, userStatus, userRole } = await getServerAuth();

  // Started before the other fetches so a slow Stripe call overlaps them instead of adding to them.
  // Never rejects (falls back internally), so an unawaited promise is safe.
  const stripeEnabled = isStripeEnabled();
  const priceLabelPromise =
    stripeEnabled && userStatus === USER_STATUS.TRIAL
      ? fetchUpgradePriceLabel()
      : Promise.resolve(null);

  const [{ data: theme }, { data: phase }, { data: contents }] = await Promise.all([
    fetchThemeById(themeIdNum, userRole),
    fetchPhaseById(phaseIdNum, userRole),
    fetchContentSummariesByPhaseId(phaseIdNum, userRole),
  ]);

  if (!theme || !phase || phase.theme_id !== themeIdNum) {
    notFound();
  }

  const isLocked = (content: ContentVisibilitySummary) =>
    isContentLockedForUser(userStatus, content.is_open_to_trial);

  // The progress denominator counts only visible (unlocked) content whose content/phase/theme
  // are all published (trial users see progress within their scope; spec 2.6). Unpublished content
  // previewed by admin/maintainer and content under unpublished parents can't be completed, so
  // exclude it (#68).
  const ancestorsPublished = theme.is_published && phase.is_published;
  const isCountable = (content: ContentVisibilitySummary) =>
    !isLocked(content) && content.is_published && ancestorsPublished;
  const contentList = contents ?? [];
  const allContentIds = contentList.map((c) => c.id);
  const visibleContentIds = contentList.filter(isCountable).map((c) => c.id);
  const exerciseContentIds = contentList
    .filter((c) => c.content_type === "exercise" && !isLocked(c))
    .map((c) => c.id);

  const [{ data: progressMap }, { data: reviewedContentIds }] = await Promise.all([
    userId
      ? fetchUserProgressByContentIds(userId, allContentIds)
      : Promise.resolve({ data: new Map<number, boolean>() }),
    userId
      ? fetchCompletedAIReviewContentIds(userId, exerciseContentIds)
      : Promise.resolve({ data: new Set<number>() }),
  ]);

  const completedCount = visibleContentIds.filter((id) => progressMap.get(id)).length;
  const totalCount = visibleContentIds.length;
  const progressValue = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const hasLockedContent = contentList.some((c) => isLocked(c));
  const showUpgradeCta = userStatus === USER_STATUS.TRIAL && hasLockedContent;
  const priceLabel = showUpgradeCta ? await priceLabelPromise : null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={phase.name}
        description={phase.description || undefined}
        breadcrumbs={[
          { label: "学習コンテンツ", href: "/learn" },
          { label: theme.name, href: `/learn/${themeIdNum}` },
          { label: phase.name },
        ]}
        badge={<UnpublishedBadge isPublished={phase.is_published} />}
      />

      {totalCount > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                進捗: {completedCount} / {totalCount} 完了
              </span>
              <span className="text-sm font-medium">{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </CardContent>
        </Card>
      )}

      {contentList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              このフェーズにはまだコンテンツが登録されていません。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-2">
            {contentList.map((content) => {
              const locked = isLocked(content);
              const isCompleted = !locked && (progressMap.get(content.id) || false);

              return (
                <Link
                  key={content.id}
                  href={`/learn/${themeIdNum}/${phaseIdNum}/${content.id}`}
                  className="block group"
                >
                  <Card
                    className={`transition-all hover:shadow-sm hover:border-primary/20 ${
                      isCompleted ? "border-l-4 border-l-success" : ""
                    } ${locked ? "opacity-60" : ""}`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div
                          className={`p-1.5 rounded-full shrink-0 ${
                            isCompleted
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {locked ? (
                            <Lock className="h-4 w-4" />
                          ) : isCompleted ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-40">
                          <h3 className="text-sm font-medium group-hover:text-primary transition-colors sm:truncate">
                            {content.title}
                          </h3>
                        </div>
                        <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
                          <ContentTypeIcon type={content.content_type} className="h-4 w-4" />
                          {CONTENT_TYPE_LABELS[content.content_type]}
                        </Badge>
                        {locked && (
                          <Badge variant="outline" className="gap-1 shrink-0 text-xs">
                            <Lock className="h-3 w-3" />
                            有料会員向け
                          </Badge>
                        )}
                        <UnpublishedBadge isPublished={content.is_published} />
                        {!locked &&
                          content.content_type === "exercise" &&
                          reviewedContentIds.has(content.id) && (
                            <Badge
                              variant="outline"
                              className="gap-1 shrink-0 text-xs border-primary/40 text-primary"
                            >
                              <Bot className="h-3 w-3" />
                              AIレビュー済み
                            </Badge>
                          )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {showUpgradeCta && (
            <Card>
              <CardContent className="py-4 space-y-2">
                <p className="text-sm">
                  鍵付きのコンテンツは有料会員になると閲覧できます
                  {stripeEnabled && " →"}
                </p>
                <UpgradeCta
                  stripeEnabled={stripeEnabled}
                  priceLabel={priceLabel}
                  source={UPGRADE_CTA_SOURCE.PHASE_LIST}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
