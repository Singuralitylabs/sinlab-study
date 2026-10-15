import { Award, Megaphone } from "lucide-react";
import Link from "next/link";
import { UpgradeBenefitsList, UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT } from "@/app/constants/announcements";
import { getWelcomeStepsForStatus } from "@/app/constants/onboarding";
import { isStripeEnabled } from "@/app/constants/stripe";
import { USER_STATUS } from "@/app/constants/user";
import { isCertificateEligible } from "@/app/lib/certificate";
import { resolveContinueLearning } from "@/app/lib/continue-learning";
import { formatDate } from "@/app/lib/format-date";
import { countVisibleUnovercome } from "@/app/lib/review-list";
import { splitThemesByActivity } from "@/app/lib/theme-progress";
import { shouldShowTrialNextStep } from "@/app/lib/trial-upgrade";
import { getViewerAnnouncements } from "@/app/services/api/announcements-server";
import { fetchRecentCertificate } from "@/app/services/api/certificates-server";
import { fetchHomeLearningData } from "@/app/services/api/learning-server";
import {
  fetchGettingStartedProgress,
  fetchOnboardingStatus,
} from "@/app/services/api/onboarding-server";
import { fetchReviewListSourceReviews } from "@/app/services/api/review-list-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { checkInstructorPermissions, isLearnerRole } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { ContinueLearningCard } from "./components/ContinueLearningCard";
import {
  buildGettingStartedItems,
  GettingStartedChecklist,
} from "./components/GettingStartedChecklist";
import { HomeQuickLinks } from "./components/HomeQuickLinks";
import { ReviewListHomeLine } from "./components/ReviewListHomeLine";
import { ActiveThemesSection } from "./components/ThemeProgressSections";
import { WelcomeDialog } from "./components/WelcomeDialog";

export default async function HomePage() {
  const { userId, userRole, userStatus } = await getServerAuth();

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">ユーザー情報を読み込み中...</p>
      </div>
    );
  }

  const isMember = !checkInstructorPermissions(userRole);
  // Align with SideNav / /review-list (null role must not show a count that links nowhere).
  const showReviewList = isLearnerRole(userRole);

  // Started before the other fetches so a slow Stripe call overlaps them instead of adding to them.
  // Never rejects (falls back internally), so an unawaited promise is safe.
  const stripeEnabled = isStripeEnabled();
  const priceLabelPromise =
    stripeEnabled && userStatus === USER_STATUS.TRIAL
      ? fetchUpgradePriceLabel()
      : Promise.resolve(null);

  // Start review fetch with home learning so badge TTFB is not serial after the other awaits.
  const [
    { data: homeLearning },
    onboardingResult,
    gettingStartedResult,
    announcementsResult,
    recentCertificate,
    reviewsResult,
  ] = await Promise.all([
    fetchHomeLearningData(userId),
    isMember ? fetchOnboardingStatus(userId) : Promise.resolve({ data: null, error: null }),
    isMember ? fetchGettingStartedProgress(userId) : Promise.resolve({ data: null, error: null }),
    getViewerAnnouncements(),
    isCertificateEligible(userStatus, userRole)
      ? fetchRecentCertificate(userId)
      : Promise.resolve(null),
    showReviewList
      ? fetchReviewListSourceReviews(userId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const visibleContentIds = new Set(homeLearning?.orderedContents.map((c) => c.id) ?? []);
  const unovercomeReviewCount =
    showReviewList && !reviewsResult.error
      ? countVisibleUnovercome(reviewsResult.data, visibleContentIds)
      : 0;
  const unreadAnnouncements = (announcementsResult.data ?? [])
    .filter((announcement) => !announcement.isRead)
    .slice(0, DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT);
  const themes = homeLearning?.summaries ?? [];
  const completedContents = themes.reduce((sum, t) => sum + t.completedContents, 0);
  const { active, completed, notStarted } = splitThemesByActivity(themes);

  const showWelcomeDialog =
    isMember && onboardingResult.error === null && onboardingResult.data?.completedAt == null;

  const firstThemeHref = themes.length > 0 ? `/learn/${themes[0].theme.id}` : "/learn";
  const gettingStartedItems = buildGettingStartedItems(
    completedContents,
    isMember ? gettingStartedResult.data : null,
    firstThemeHref
  );

  const showTrialNextStep = shouldShowTrialNextStep(userStatus, userRole, themes);
  const priceLabel = showTrialNextStep ? await priceLabelPromise : null;

  const continueLearning =
    !showTrialNextStep && homeLearning
      ? resolveContinueLearning(
          homeLearning.orderedContents,
          homeLearning.completedContentIds,
          homeLearning.completedAtByContentId
        )
      : null;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-6">ホーム</h1>

      {showWelcomeDialog && (
        <WelcomeDialog
          steps={getWelcomeStepsForStatus(userStatus)}
          stripeEnabled={isStripeEnabled()}
        />
      )}

      {recentCertificate && (
        <Card className="mb-6 border-l-4 border-l-success">
          <CardContent className="pt-6">
            <Link
              href={`/certificates/${recentCertificate.id}`}
              className="flex items-center gap-3 hover:text-primary"
            >
              <Award className="h-6 w-6 text-success shrink-0" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">修了証が発行されました</h2>
                <p className="text-sm text-muted-foreground truncate">
                  {recentCertificate.theme_name}
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>
      )}

      {unreadAnnouncements.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                未読のお知らせ
              </h2>
              <Link href="/announcements" className="text-sm text-primary hover:underline">
                すべて見る
              </Link>
            </div>
            <ul className="space-y-2">
              {unreadAnnouncements.map((announcement) => (
                <li key={announcement.id}>
                  <Link
                    href={`/announcements/${announcement.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <span className="truncate font-medium">{announcement.title}</span>
                    {announcement.published_at && (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {formatDate(announcement.published_at)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <HomeQuickLinks stripeEnabled={stripeEnabled} />

      {showReviewList && <ReviewListHomeLine count={unovercomeReviewCount} />}

      {continueLearning && <ContinueLearningCard target={continueLearning} />}

      {showTrialNextStep && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <h2 className="text-lg font-semibold">次のステップ</h2>
            <p className="text-sm">お試しコンテンツをすべて完了しました。続きは有料会員で</p>
            <UpgradeBenefitsList />
            <UpgradeCta
              stripeEnabled={stripeEnabled}
              priceLabel={priceLabel}
              source={UPGRADE_CTA_SOURCE.DASHBOARD_CARD}
            />
          </CardContent>
        </Card>
      )}

      {isMember && <GettingStartedChecklist items={gettingStartedItems} />}

      <ActiveThemesSection
        active={active}
        firstNotStarted={notStarted.find((summary) => summary.totalContents > 0) ?? null}
        hasCompleted={completed.length > 0}
      />
    </div>
  );
}
