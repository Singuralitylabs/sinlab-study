import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { USER_STATUS } from "@/app/constants/user";
import { fetchStripeSubscriptionByUserId } from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";
import { UpgradeCheckoutButton } from "./UpgradeCheckoutButton";

export default async function UpgradePage() {
  const { userId, userStatus } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const subscription =
    userStatus === USER_STATUS.ACTIVE ? (await fetchStripeSubscriptionByUserId(userId)).data : null;

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle
        title="アップグレード"
        description="一般有料会員になると、すべての学習コンテンツを利用できます"
      />

      <Card className="mt-6">
        <CardContent className="space-y-4">
          {userStatus === USER_STATUS.PENDING && (
            <>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます</li>
                <li>月額サブスクリプションで、いつでも解約可能です</li>
                <li>お手続き完了後、すぐにご利用いただけます</li>
              </ul>
              <UpgradeCheckoutButton />
            </>
          )}

          {userStatus === USER_STATUS.ACTIVE && subscription && (
            <>
              <p className="text-sm">
                ご契約中です
                {subscription.cancel_at_period_end && "（次回更新日をもって解約予定です）"}
              </p>
              <ManageSubscriptionButton />
            </>
          )}

          {userStatus === USER_STATUS.ACTIVE && !subscription && (
            <p className="text-sm text-muted-foreground">
              既に本登録済みです。すべての学習コンテンツをご利用いただけます。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
