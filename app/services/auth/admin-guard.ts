import { NextResponse } from "next/server";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { getServerAuth } from "@/app/services/auth/server-auth";

type ServerAuth = Awaited<ReturnType<typeof getServerAuth>>;

/**
 * Shared admin gate for API routes: 401 unauthenticated, 403 rejected, 403 non-admin. Rejected
 * users keep their role, so a role check alone would let a former admin through.
 */
export async function requireAdminApi(): Promise<
  { response: NextResponse } | { response: null; auth: ServerAuth }
> {
  const auth = await getServerAuth();
  if (!auth.user) {
    return { response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (auth.userStatus === USER_STATUS.REJECTED) {
    return {
      response: NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 }),
    };
  }
  if (auth.userRole !== USER_ROLE.ADMIN) {
    return { response: NextResponse.json({ error: "権限がありません" }, { status: 403 }) };
  }
  return { response: null, auth };
}
