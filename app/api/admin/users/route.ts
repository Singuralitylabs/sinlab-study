import { NextResponse } from "next/server";
import { USER_ROLE } from "@/app/constants/user";
import { approveUser, changeUserRole, rejectUser } from "@/app/services/api/admin-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function PATCH(request: Request) {
  try {
    // 管理者権限チェック
    const auth = await getServerAuth();
    if (!auth.user || auth.userRole !== USER_ROLE.ADMIN) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, role } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "userId と action は必須です" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject" && action !== "change_role") {
      return NextResponse.json(
        { error: "action は approve / reject / change_role を指定してください" },
        { status: 400 }
      );
    }

    if (action === "change_role") {
      if (!role || !["member", "maintainer", "admin"].includes(role)) {
        return NextResponse.json(
          { error: "role は member / maintainer / admin を指定してください" },
          { status: 400 }
        );
      }

      // 対象ユーザーが admin の場合はロール変更不可
      const supabase = await createAdminSupabaseClient();
      const { data: targetUser } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (targetUser?.role === USER_ROLE.ADMIN) {
        return NextResponse.json(
          { error: "管理者ユーザーのロールは変更できません" },
          { status: 403 }
        );
      }

      const { error } = await changeUserRole(userId, role);
      if (error) {
        return NextResponse.json({ error: "ロール更新に失敗しました" }, { status: 500 });
      }
      return NextResponse.json({ success: true, action });
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
