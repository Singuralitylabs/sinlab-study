export const dynamic = "force-dynamic";

import { checkAdminPermissions, checkInstructorPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { SideNav } from "./components/SideNav";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 認可判定（未認証・pending・rejectedのリダイレクト）は proxy.ts で一元化済み。
  // ここではナビゲーション表示用のロール取得のみを行う。
  const { userRole } = await getServerAuth();
  const isAdmin = userRole ? checkAdminPermissions(userRole) : false;
  const isInstructor = userRole ? checkInstructorPermissions(userRole) : false;

  return (
    <div className="sm:flex min-h-screen">
      <SideNav isAdmin={isAdmin} isInstructor={isInstructor} />
      <main className="flex-1 sm:ml-64 p-6 pt-20 sm:pt-6">{children}</main>
    </div>
  );
}
