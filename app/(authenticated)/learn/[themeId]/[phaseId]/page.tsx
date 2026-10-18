import { BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { summarizePhaseProgress } from "@/app/lib/phase-progress";
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
import { Card, CardContent } from "@/components/ui/card";
import { LearnContentRow } from "../../components/LearnContentRow";
import { LockedContentUpgradeCard } from "../../components/LockedContentUpgradeCard";

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

  const ancestorsPublished = theme.is_published && phase.is_published;
  const contentList = contents ?? [];
  const allContentIds = contentList.map((c) => c.id);
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

  const { completed: completedCount, total: totalCount } = summarizePhaseProgress(contentList, {
    isLocked,
    ancestorsPublished,
    progressMap,
  });

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
        <p className="-mt-3 mb-6 text-sm text-muted-foreground">
          {completedCount} / {totalCount} 完了
        </p>
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
              return (
                <LearnContentRow
                  key={content.id}
                  href={`/learn/${themeIdNum}/${phaseIdNum}/${content.id}`}
                  title={content.title}
                  contentType={content.content_type}
                  isPublished={content.is_published}
                  locked={locked}
                  completed={!locked && (progressMap.get(content.id) || false)}
                  aiReviewed={reviewedContentIds.has(content.id)}
                />
              );
            })}
          </div>

          {showUpgradeCta && (
            <LockedContentUpgradeCard stripeEnabled={stripeEnabled} priceLabel={priceLabel} />
          )}
        </div>
      )}
    </div>
  );
}
