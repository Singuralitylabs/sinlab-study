import { headers } from "next/headers";
import { cache } from "react";
import { AUTH_HEADERS } from "@/app/constants/auth";
import { ALLOWED_USER_STATUSES, MEMBERSHIP_TYPES, USER_ROLES } from "@/app/constants/user";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import type { MembershipType, UserRoleType, UserStatusType } from "@/app/types";

/**
 * Identity from a JWKS-verified access token (`getClaims()`), not the Auth server User record.
 * Call sites only need `id` (sub) and optional `email`; reach for `getUser()` only when a fresh
 * Auth-server user object is required.
 */
export interface AuthIdentity {
  id: string;
  email: string | undefined;
}

export interface ServerAuthResult {
  user: AuthIdentity | null;
  userId: number | null;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  /** null = no membership type (e.g. trial); undefined = not resolved (callers must read the DB). */
  membershipType?: MembershipType | null;
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

function identityFromClaims(claims: { sub: string; email?: string }): AuthIdentity {
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}

// Memoized per request via React.cache(), so layouts and pages do not repeat it.
export const getServerAuth = cache(async (): Promise<ServerAuthResult> => {
  try {
    const supabase = await createServerSupabaseClient();

    // Local JWKS verify when the project uses asymmetric JWT keys; avoids /auth/v1/user per request.
    const { data: claimsData, error: authError } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    if (authError || !claims?.sub) {
      return { user: null, userId: null, userStatus: null, userRole: null };
    }

    const user = identityFromClaims(claims);

    // Use the headers set by proxy.ts: pages that go through the proxy skip the DB re-query.
    try {
      const headerList = await headers();
      const headerAuthId = headerList.get(AUTH_HEADERS.AUTH_ID);
      const headerUserId = headerList.get(AUTH_HEADERS.USER_ID);
      const headerUserStatus = headerList.get(AUTH_HEADERS.USER_STATUS);
      const headerUserRole = headerList.get(AUTH_HEADERS.USER_ROLE);
      const headerMembershipType = headerList.get(AUTH_HEADERS.MEMBERSHIP_TYPE);

      // Tamper check: claims.sub must match the header auth_id, and status/role must be valid
      // values before trusting the headers. The proxy only sets them for active / trial, so status
      // is limited to ALLOWED_USER_STATUSES.
      const isValidStatus =
        headerUserStatus !== null &&
        ALLOWED_USER_STATUSES.includes(headerUserStatus as (typeof ALLOWED_USER_STATUSES)[number]);
      const isValidRole =
        headerUserRole !== null && USER_ROLES.includes(headerUserRole as UserRoleType);
      // "" is the proxy's encoding of "no membership type"; anything else must be an allowed value.
      const isValidMembershipType =
        headerMembershipType !== null &&
        (headerMembershipType === "" ||
          MEMBERSHIP_TYPES.includes(headerMembershipType as MembershipType));
      const isValidUserId = headerUserId !== null && /^\d+$/.test(headerUserId);
      const parsedUserId = isValidUserId ? Number(headerUserId) : null;

      if (
        headerAuthId &&
        headerAuthId === user.id &&
        parsedUserId !== null &&
        isValidStatus &&
        isValidRole &&
        isValidMembershipType
      ) {
        return {
          user,
          userId: parsedUserId,
          userStatus: headerUserStatus as UserStatusType,
          userRole: headerUserRole as UserRoleType,
          membershipType: (headerMembershipType || null) as MembershipType | null,
        };
      }
    } catch (headerError) {
      rethrowIfControlError(headerError);
      // If headers() fails, fall back to the DB query.
    }

    // API routes that skip the proxy, or a header mismatch, read from the DB as before.
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, status, role, membership_type")
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
      // Same allowlist as the header path: an unexpected stored value is treated as no type.
      membershipType: MEMBERSHIP_TYPES.includes(userData.membership_type as MembershipType)
        ? (userData.membership_type as MembershipType)
        : null,
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
