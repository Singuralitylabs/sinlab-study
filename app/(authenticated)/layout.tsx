export const dynamic = "force-dynamic";

import { Clock } from "lucide-react";
import { redirect } from "next/navigation";
import { USER_STATUS } from "@/app/constants/user";
import { checkAdminPermissions, checkInstructorPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SideNav } from "./components/SideNav";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userStatus, userRole } = await getServerAuth();

  // 認可の第一の砦は proxy.ts だが、プロキシのスキップ経路や設定不備に備え、
  // サーバー側でも active / pending（お試しユーザー）のみ許可する（許可リスト方式の二層防御）。
  // getServerAuth() は React.cache() でメモ化済みのため追加のDBアクセスは発生しない
  if (userStatus !== USER_STATUS.ACTIVE && userStatus !== USER_STATUS.PENDING) {
    if (userStatus === USER_STATUS.REJECTED) {
      redirect("/rejected");
    }
    redirect("/login");
  }

  const isAdmin = checkAdminPermissions(userRole);
  const isInstructor = checkInstructorPermissions(userRole);

  return (
    <div className="sm:flex min-h-screen">
      <SideNav isAdmin={isAdmin} isInstructor={isInstructor} />
      <main className="flex-1 sm:ml-64 p-6 pt-20 sm:pt-6">
        {userStatus === USER_STATUS.PENDING && (
          <Alert className="mb-6">
            <Clock />
            <AlertDescription>
              現在は無料プランでご利用中です。「お試し公開」コンテンツの閲覧・提出が可能です。すべての学習コンテンツを利用するには、管理者による本登録が必要です。
            </AlertDescription>
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
