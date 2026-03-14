import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import type { UserRoleType, UserStatusType } from "@/app/types";

export interface ServerAuthResult {
  user: User | null;
  userId: number | null;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  error?: string;
}

// サーバーサイドで認証とユーザーステータスを確認
export async function getServerAuth(): Promise<ServerAuthResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // ユーザー認証確認（セキュア）
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { user: null, userId: null, userStatus: null, userRole: null };
    }

    // ユーザーステータス確認
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, status, role")
      .eq("auth_id", user.id)
      .eq("is_deleted", false)
      .single();

    if (userError || !userData) {
      return {
        user,
        userId: null,
        userStatus: null,
        userRole: null,
        error: "ユーザー情報が見つかりません",
      };
    }

    return {
      user,
      userId: userData.id,
      userStatus: userData.status as UserStatusType,
      userRole: userData.role as UserRoleType,
    };
  } catch (error) {
    console.error("サーバー認証エラー:", error);
    return {
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
      error: "サーバー認証エラーが発生しました",
    };
  }
}
