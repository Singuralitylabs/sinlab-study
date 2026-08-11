import { NextResponse } from "next/server";
import { MEMBERSHIP_TYPES, USER_ROLE } from "@/app/constants/user";
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
    const { userId, action, role, membershipType } = body;

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

    // 承認時は会員種別（コミュニティ会員 / 一般有料会員）の指定を必須とする
    if (action === "approve" && !MEMBERSHIP_TYPES.includes(membershipType)) {
      return NextResponse.json(
        { error: `membershipType は ${MEMBERSHIP_TYPES.join(" / ")} を指定してください` },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const { error, updated } = await approveUser(userId, membershipType);
      if (error) {
        return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
      }
      // 0行更新 = 既に承認済み（再承認による会員種別の意図しない上書きを防止。種別変更は #95 で対応）、
      // または存在しない・削除済みユーザー
      if (!updated) {
        return NextResponse.json(
          {
            error:
              "このユーザーは承認できません（承認済みか、存在しません）。画面を更新して最新の状態を確認してください",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, action });
    }

    const { error } = await rejectUser(userId);
    if (error) {
      return NextResponse.json({ error: "ステータス更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("ユーザー管理APIエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
