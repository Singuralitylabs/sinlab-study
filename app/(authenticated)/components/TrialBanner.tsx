"use client";

import { Clock } from "lucide-react";
import { usePathname } from "next/navigation";
import { UpgradeCtaLink } from "@/app/components/UpgradeCtaLink";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { shouldHideTrialBanner } from "@/app/lib/trial-banner";
import { Alert, AlertDescription } from "@/components/ui/alert";

// A client component because the layout is not re-rendered on client navigation and cannot read
// the pathname, so only usePathname() keeps the banner in step when moving between pages.
export function TrialBanner({ stripeEnabled }: { stripeEnabled: boolean }) {
  const pathname = usePathname();
  if (shouldHideTrialBanner(pathname)) {
    return null;
  }

  return (
    <Alert className="mb-6">
      <Clock />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          現在は無料プランでご利用中です。「お試し公開」コンテンツの閲覧・提出が可能です。
          {stripeEnabled
            ? "すべての学習コンテンツを利用するには、アップグレードまたは管理者による本登録が必要です。"
            : "すべての学習コンテンツを利用するには、管理者による本登録が必要です。"}
        </span>
        {stripeEnabled && (
          <UpgradeCtaLink source={UPGRADE_CTA_SOURCE.BANNER} size="sm">
            アップグレード
          </UpgradeCtaLink>
        )}
      </AlertDescription>
    </Alert>
  );
}
