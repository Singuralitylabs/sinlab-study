import { UpgradeCta } from "@/app/components/TrialUpgradePrompt";
import { UPGRADE_CTA_SOURCE } from "@/app/constants/analytics";
import type { AIReviewLimits } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import { activeLimitSummary, trialLimitMessage } from "@/app/lib/ai-review-limits";
import type { UserStatusType } from "@/app/types";

interface AIReviewLimitNoticeProps {
  userStatus: UserStatusType | null;
  /** Computed on the server at render time; null when the usage lookup failed. */
  remaining: number | null;
  /** Today's remaining reviews across all exercises; null when the usage lookup failed. */
  dailyTotalRemaining?: number | null;
  stripeEnabled: boolean;
  limits: AIReviewLimits;
}

export function AIReviewLimitNotice({
  userStatus,
  remaining,
  dailyTotalRemaining = null,
  stripeEnabled,
  limits,
}: AIReviewLimitNoticeProps) {
  if (userStatus === USER_STATUS.ACTIVE) {
    return (
      <div className="text-right text-xs text-muted-foreground">
        <p>※ AIレビューは新しい提出に対して{activeLimitSummary(limits)}までです</p>
        {remaining !== null && <p>本日の残り回数: {remaining}回</p>}
        {dailyTotalRemaining !== null && <p>全課題の合計の残り回数: {dailyTotalRemaining}回</p>}
        {remaining === 0 && dailyTotalRemaining === 0 && (
          <p>本日の全課題の合計上限に達しています。明日0時（日本時間）にリセットされます</p>
        )}
      </div>
    );
  }

  if (userStatus === USER_STATUS.TRIAL) {
    return (
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p className="text-muted-foreground">{trialLimitMessage(limits)}</p>
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
