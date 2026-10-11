"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ANALYTICS_EVENT,
  sanitizeAnalyticsProperties,
  type UpgradeCtaSource,
} from "@/app/constants/analytics";
import { Button } from "@/components/ui/button";

/** Client track() returns void. A throw must not block navigation to /upgrade. */
export function trackUpgradeCtaClicked(source: UpgradeCtaSource): void {
  try {
    const properties = sanitizeAnalyticsProperties({ source });
    if (properties) {
      track(ANALYTICS_EVENT.UPGRADE_CTA_CLICKED, properties);
    }
  } catch (error) {
    console.error("[analytics] イベント送信に失敗しました:", error);
  }
}

export function UpgradeCtaLink({
  source,
  size = "default",
  children,
}: {
  source: UpgradeCtaSource;
  size?: "default" | "sm";
  children: ReactNode;
}) {
  return (
    <Button asChild size={size}>
      <Link
        href="/upgrade"
        data-analytics-source={source}
        onClick={() => {
          trackUpgradeCtaClicked(source);
        }}
      >
        {children}
      </Link>
    </Button>
  );
}
