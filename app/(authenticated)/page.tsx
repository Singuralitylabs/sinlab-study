import { Award, BookOpen, CheckCircle, Clock, Megaphone, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { UpgradeBenefitsList, UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT } from "@/app/constants/announcements";
import { getWelcomeStepsForStatus } from "@/app/constants/onboarding";
import { isStripeEnabled } from "@/app/constants/stripe";
import { isCertificateEligible } from "@/app/lib/certificate";
import { formatDate } from "@/app/lib/format-date";
import { resolveStorageUrl } from "@/app/lib/storage-url";
import { shouldShowTrialNextStep } from "@/app/lib/trial-upgrade";
import { getViewerAnnouncements } from "@/app/services/api/announcements-server";
import { fetchRecentCertificate } from "@/app/services/api/certificates-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
import {
  fetchGettingStartedProgress,
  fetchOnboardingStatus,
} from "@/app/services/api/onboarding-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { checkInstructorPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  buildGettingStartedItems,
  GettingStartedChecklist,
} from "./components/GettingStartedChecklist";
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

  const [
    { data: themeData },
    onboardingResult,
    gettingStartedResult,
    announcementsResult,
    recentCertificate,
  ] = await Promise.all([
    fetchThemeProgressSummaries(userId),
    isMember ? fetchOnboardingStatus(userId) : Promise.resolve({ data: null, error: null }),
    isMember ? fetchGettingStartedProgress(userId) : Promise.resolve({ data: null, error: null }),
    getViewerAnnouncements(),
    isCertificateEligible(userStatus, userRole)
      ? fetchRecentCertificate(userId)
      : Promise.resolve(null),
  ]);
  const unreadAnnouncements = (announcementsResult.data ?? [])
    .filter((announcement) => !announcement.isRead)
    .slice(0, DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT);
  const themes = themeData ?? [];
  const totalContents = themes.reduce((sum, t) => sum + t.totalContents, 0);
  const completedContents = themes.reduce((sum, t) => sum + t.completedContents, 0);
  const overallProgress =
    totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;

  const showWelcomeDialog =
    isMember && onboardingResult.error === null && onboardingResult.data?.completedAt == null;

  const firstThemeHref = themes.length > 0 ? `/learn/${themes[0].theme.id}` : "/learn";
  const gettingStartedItems = buildGettingStartedItems(
    completedContents,
    isMember ? gettingStartedResult.data : null,
    firstThemeHref
  );

  const showTrialNextStep = shouldShowTrialNextStep(userStatus, userRole, themes);
  const stripeEnabled = isStripeEnabled();
  const priceLabel = showTrialNextStep && stripeEnabled ? await fetchUpgradePriceLabel() : null;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-6">ダッシュボード</h1>

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

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">学習進捗</h2>
              <p className="text-sm text-muted-foreground">
                {completedContents} / {totalContents} コンテンツ完了
              </p>
            </div>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <p className="text-right text-sm text-muted-foreground mt-2">{overallProgress}%</p>
        </CardContent>
      </Card>

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

      <div className="grid gap-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          学習テーマ
        </h2>

        {themes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>学習コンテンツはまだ登録されていません。</p>
            </CardContent>
          </Card>
        ) : (
          themes.map(({ theme, totalContents, completedContents }) => {
            const progress =
              totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;
            const isCompleted = totalContents > 0 && completedContents === totalContents;

            return (
              <Link key={theme.id} href={`/learn/${theme.id}`} className="block group">
                <Card
                  className={`overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${isCompleted ? "border-l-4 border-l-success" : ""}`}
                >
                  <div className="flex">
                    <div className="relative w-24 shrink-0 bg-linear-to-br from-primary/5 to-primary/15">
                      {theme.image_url ? (
                        <Image
                          src={resolveStorageUrl(theme.image_url)}
                          alt={theme.name}
                          fill
                          className="object-contain"
                          sizes="96px"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-primary/30" />
                        </div>
                      )}
                    </div>

                    <CardContent className="pt-4 pb-4 flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 text-success shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                            {theme.name}
                          </h3>
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 ml-2">
                          {completedContents} / {totalContents}
                        </span>
                      </div>
                      {theme.description && (
                        <p className="text-sm text-muted-foreground mb-2 ml-6 line-clamp-1">
                          {theme.description}
                        </p>
                      )}
                      <div className="ml-6">
                        <Progress value={progress} className="h-2" />
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {themes.length > 0 && (
        <div className="mt-6 text-center">
          <Button asChild>
            <Link href="/learn">学習を始める</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
