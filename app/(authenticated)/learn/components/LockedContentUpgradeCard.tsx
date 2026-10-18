import { UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { Card, CardContent } from "@/components/ui/card";

export function LockedContentUpgradeCard({
  stripeEnabled,
  priceLabel,
}: {
  stripeEnabled: boolean;
  priceLabel: string | null;
}) {
  return (
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
  );
}
