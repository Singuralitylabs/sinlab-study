import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllUsers, fetchUserIdsWithStripeSubscription } from "@/app/services/api/admin-server";
import { UserManagementTable } from "./components/user-management-table";

export default async function AdminUsersPage() {
  const [{ data: users, error }, { data: subscribedUserIds, error: subscriptionsError }] =
    await Promise.all([fetchAllUsers(), fetchUserIdsWithStripeSubscription()]);

  return (
    <div>
      <PageTitle title="ユーザー管理" />

      {error && <p className="text-destructive text-sm">ユーザー一覧の取得に失敗しました。</p>}

      {subscriptionsError && (
        <p className="text-destructive text-sm mb-2">
          Stripe契約状況の取得に失敗しました。契約中バッジが正しく表示されない可能性があります。却下操作を行う前に、対象ユーザーのStripe契約状況をダッシュボードで直接ご確認ください。
        </p>
      )}

      {users && (
        <UserManagementTable
          users={users}
          subscribedUserIds={subscribedUserIds ?? []}
          subscriptionDataUnavailable={subscriptionsError != null}
        />
      )}
    </div>
  );
}
