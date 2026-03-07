export const dynamic = "force-dynamic";

import { getServerCurrentUser } from "@/app/services/api/supabase-server";
import { fetchUserInfoByAuthId } from "@/app/services/api/users-server";
import { checkAdminPermissions, checkInstructorPermissions } from "@/app/services/auth/permissions";
import { AuthLayout as AuthGuard } from "./auth-layout";
import { SideNav } from "./components/SideNav";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAdmin = false;
  let isInstructor = false;

  try {
    const { authId, error: currentUserError } = await getServerCurrentUser();
    if (!currentUserError && authId) {
      const { role, error: roleError } = await fetchUserInfoByAuthId({ authId });
      if (!roleError && role) {
        isAdmin = checkAdminPermissions(role);
        isInstructor = checkInstructorPermissions(role);
      }
    }
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      error.digest !== "DYNAMIC_SERVER_USAGE"
    ) {
      console.error("レイアウトでのユーザー情報取得エラー:", error);
    }
  }

  return (
    <AuthGuard>
      <div className="sm:flex min-h-screen">
        <SideNav isAdmin={isAdmin} isInstructor={isInstructor} />
        <main className="flex-1 sm:ml-64 p-6 pt-20 sm:pt-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
