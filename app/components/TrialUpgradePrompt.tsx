import Link from "next/link";
import { UPGRADE_APPROVAL_NOTICE, UPGRADE_BENEFITS } from "@/app/constants/stripe";
import { Button } from "@/components/ui/button";

export function UpgradeBenefitsList() {
  return (
    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
      {UPGRADE_BENEFITS.map((benefit) => (
        <li key={benefit}>{benefit}</li>
      ))}
    </ul>
  );
}

/**
 * With payments disabled only the approval notice is shown and no /upgrade link is rendered (same
 * branching as the trial banner).
 */
export function UpgradeCta({
  stripeEnabled,
  priceLabel,
}: {
  stripeEnabled: boolean;
  priceLabel: string | null;
}) {
  if (!stripeEnabled) {
    return <p className="text-sm text-muted-foreground">{UPGRADE_APPROVAL_NOTICE}</p>;
  }
  return (
    <div className="space-y-3">
      {priceLabel && <p className="text-sm font-medium">{priceLabel}で全コンテンツが使えます</p>}
      <Button asChild>
        <Link href="/upgrade">アップグレード</Link>
      </Button>
    </div>
  );
}
