import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllUsers, fetchUserIdsWithStripeSubscription } from "@/app/services/api/admin-server";
import { UserManagementTable } from "./components/user-management-table";

export default async function AdminUsersPage() {
  const [{ data: users, error }, { data: subscribedUserIds }] = await Promise.all([
    fetchAllUsers(),
    fetchUserIdsWithStripeSubscription(),
  ]);

  return (
    <div>
      <PageTitle title="ユーザー管理" />

      {error && <p className="text-destructive text-sm">ユーザー一覧の取得に失敗しました。</p>}

      {users && <UserManagementTable users={users} subscribedUserIds={subscribedUserIds ?? []} />}
    </div>
  );
}
