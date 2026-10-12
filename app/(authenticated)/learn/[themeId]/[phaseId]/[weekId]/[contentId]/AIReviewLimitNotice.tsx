import { UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import { trialLimitMessage } from "@/app/lib/ai-review-limits";
import type { UserStatusType } from "@/app/types";

interface AIReviewLimitNoticeProps {
  userStatus: UserStatusType | null;
  /** Computed on the server at render time; null when the usage lookup failed. */
  remaining: number | null;
  stripeEnabled: boolean;
}

export function AIReviewLimitNotice({
  userStatus,
  remaining,
  stripeEnabled,
}: AIReviewLimitNoticeProps) {
  if (userStatus === USER_STATUS.ACTIVE) {
    return (
      <div className="text-right text-xs text-muted-foreground">
        <p>
          ※ AIレビューは新しい提出に対して1日{AI_REVIEW_LIMITS.active.perContentPerDay}
          回までです
        </p>
        {remaining !== null && <p>本日の残り回数: {remaining}回（この課題）</p>}
      </div>
    );
  }

  if (userStatus === USER_STATUS.TRIAL) {
    return (
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p className="text-muted-foreground">{trialLimitMessage()}</p>
        <UpgradeCta
          stripeEnabled={stripeEnabled}
          priceLabel={null}
          source={UPGRADE_CTA_SOURCE.AI_REVIEW_LIMIT}
        />
      </div>
    );
  }

  return null;
}
