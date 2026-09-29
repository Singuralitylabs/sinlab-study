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

/**
 * Rethrow Next.js control errors (dynamic rendering bailout, redirect, etc.) instead of
 * swallowing them.
 */
function rethrowIfControlError(error: unknown): void {
  if (error && typeof error === "object" && "digest" in error) {
    throw error;
  }
}

// Memoized per request via React.cache(), so layouts and pages do not repeat it.
export const getServerAuth = cache(async (): Promise<ServerAuthResult> => {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { user: null, userId: null, userStatus: null, userRole: null };
    }

    // Use the headers set by proxy.ts: pages that go through the proxy skip the DB re-query.
    try {
      const headerList = await headers();
      const headerAuthId = headerList.get(AUTH_HEADERS.AUTH_ID);
      const headerUserId = headerList.get(AUTH_HEADERS.USER_ID);
      const headerUserStatus = headerList.get(AUTH_HEADERS.USER_STATUS);
      const headerUserRole = headerList.get(AUTH_HEADERS.USER_ROLE);

      // Tamper check: the auth.getUser() user.id must match the header auth_id, and status/role
      // must be valid values before trusting the headers. The proxy only sets them for active /
      // trial, so status is limited to ALLOWED_USER_STATUSES.
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
      // If headers() fails, fall back to the DB query.
    }

    // API routes that skip the proxy, or a header mismatch, read from the DB as before.
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
