import { NextResponse } from "next/server";
import { USER_ROLE } from "@/app/constants/user";
import { approveUser, rejectUser } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function PATCH(request: Request) {
  try {
    // 管理者権限チェック
    const auth = await getServerAuth();
    if (!auth.user || auth.userRole !== USER_ROLE.ADMIN) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "userId と action は必須です" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action は approve または reject を指定してください" },
        { status: 400 }
      );
    }

    const { error } = action === "approve" ? await approveUser(userId) : await rejectUser(userId);

    if (error) {
      return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("ユーザー管理APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
