import { NextResponse } from "next/server";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { checkContentPermissions } from "@/app/services/auth/permissions";
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

/**
 * Content-manager gate (admin or maintainer) with the same checks and messages the /manage
 * content routes use: 401 unauthenticated, 403 no users row, 403 rejected, 403 no permission.
 */
export async function requireContentManagerApi(): Promise<
  { response: NextResponse } | { response: null; auth: ServerAuth }
> {
  const auth = await getServerAuth();
  if (!auth.user) {
    return { response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (!auth.userId) {
    return {
      response: NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 }),
    };
  }
  if (auth.userStatus === USER_STATUS.REJECTED) {
    return {
      response: NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 }),
    };
  }
  if (!checkContentPermissions(auth.userRole)) {
    return {
      response: NextResponse.json({ error: "コンテンツ管理権限がありません" }, { status: 403 }),
    };
  }
  return { response: null, auth };
}

/**
 * Learner gate for routes any signed-in, non-rejected user may call (same checks and messages as
 * the progress / submission routes): 401 unauthenticated, 403 no users row, 403 rejected.
 * Content visibility is the route's job.
 */
export async function requireLearnerApi(): Promise<
  { response: NextResponse } | { response: null; auth: ServerAuth & { userId: number } }
> {
  const auth = await getServerAuth();
  if (!auth.user) {
    return { response: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (auth.userId == null) {
    return {
      response: NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 }),
    };
  }
  if (auth.userStatus === USER_STATUS.REJECTED) {
    return {
      response: NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 }),
    };
  }
  return { response: null, auth: { ...auth, userId: auth.userId } };
}
