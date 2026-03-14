import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllUsers } from "@/app/services/api/admin-server";
import { UserManagementTable } from "./components/user-management-table";

export default async function AdminUsersPage() {
  const { data: users, error } = await fetchAllUsers();

  return (
    <div>
      <PageTitle title="ユーザー管理" />

      {error && <p className="text-destructive text-sm">ユーザー一覧の取得に失敗しました。</p>}

      {users && <UserManagementTable users={users} />}
    </div>
  );
}
