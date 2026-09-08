import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { cache } from "react";
import { AUTH_HEADERS } from "@/app/constants/auth";
import { ALLOWED_USER_STATUSES, USER_ROLES } from "@/app/constants/user";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import type { UserRoleType, UserStatusType } from "@/app/types";

export interface ServerAuthResult {
  user: User | null;
  userId: number | null;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  error?: string;
}

/** Next.js の制御エラー（動的レンダリング化・redirect等）は握り潰さずに再スロー */
function rethrowIfControlError(error: unknown): void {
  if (error && typeof error === "object" && "digest" in error) {
    throw error;
  }
}

// サーバーサイドで認証とユーザーステータスを確認
// React.cache() によりリクエスト単位でメモ化され、layout・page間で重複実行されない
export const getServerAuth = cache(async (): Promise<ServerAuthResult> => {
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

    // proxy.ts から渡されたヘッダーを確認
    // proxy を経由する通常ページでは DB への再問い合わせを省略する
    try {
      const headerList = await headers();
      const headerAuthId = headerList.get(AUTH_HEADERS.AUTH_ID);
      const headerUserId = headerList.get(AUTH_HEADERS.USER_ID);
      const headerUserStatus = headerList.get(AUTH_HEADERS.USER_STATUS);
      const headerUserRole = headerList.get(AUTH_HEADERS.USER_ROLE);

      // 改ざん検知: auth.getUser() の user.id とヘッダーの auth_id を突合し、
      // かつステータス・ロールが有効な値の場合のみヘッダーを採用する。
      // proxy がヘッダーを設定するのは active / trial のみのため、ステータスは ALLOWED_USER_STATUSES に限定する
      const isValidStatus =
        headerUserStatus !== null &&
        ALLOWED_USER_STATUSES.includes(headerUserStatus as (typeof ALLOWED_USER_STATUSES)[number]);
      const isValidRole =
        headerUserRole !== null && USER_ROLES.includes(headerUserRole as UserRoleType);
      const isValidUserId = headerUserId !== null && /^\d+$/.test(headerUserId);
      const parsedUserId = isValidUserId ? Number(headerUserId) : null;

      if (
        headerAuthId &&
        headerAuthId === user.id &&
        parsedUserId !== null &&
        isValidStatus &&
        isValidRole
      ) {
        return {
          user,
          userId: parsedUserId,
          userStatus: headerUserStatus as UserStatusType,
          userRole: headerUserRole as UserRoleType,
        };
      }
    } catch (headerError) {
      rethrowIfControlError(headerError);
      // headers() 取得失敗時は DB 照会へフォールバック
    }

    // proxy をスキップする API Route やヘッダー不一致時は従来どおり DB から取得
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, status, role")
      .eq("auth_id", user.id)
      .eq("is_deleted", false)
      .single();

    if (userError || !userData) {
      console.error("ユーザー情報取得エラー:", userError?.message || "No data found");
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
    rethrowIfControlError(error);
    console.error("サーバー認証エラー:", error);
    return {
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
      error: "サーバー認証エラーが発生しました",
    };
  }
});
