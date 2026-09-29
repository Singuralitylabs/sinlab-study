import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  TERMS_CONSENT_COOKIE_NAME,
  TERMS_CONSENT_COOKIE_VALUE,
  TERMS_REQUIRED_ERROR_CODE,
} from "@/app/constants/auth";
import { USER_ROLE, USER_STATUS } from "@/app/constants/user";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { sendSlackNewUserNotification } from "@/app/services/notifications/slack";
import { scheduleSignupEmail } from "@/app/services/notifications/user-emails";

const REGISTRATION_FAILED_PATH = "/login?error=registration_failed";
const TERMS_REQUIRED_PATH = `/login?error=${TERMS_REQUIRED_ERROR_CODE}`;

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function redirectWithSessionCookies(
  url: URL,
  cookies: CookieToSet[],
  headers: Record<string, string>
) {
  const redirectResponse = NextResponse.redirect(url);
  for (const { name, value, options } of cookies) {
    redirectResponse.cookies.set(name, value, options);
  }
  // The consent cookie is single-use; delete it reliably even on session-carrying responses.
  redirectResponse.cookies.delete(TERMS_CONSENT_COOKIE_NAME);
  // Responses carrying session cookies must not be CDN-cached (Cache-Control etc. from
  // @supabase/ssr).
  for (const [key, value] of Object.entries(headers)) {
    redirectResponse.headers.set(key, value);
  }
  return redirectResponse;
}

/** Error redirect without session cookies; only deletes the consent cookie. */
function redirectWithoutSession(url: URL) {
  const redirectResponse = NextResponse.redirect(url);
  redirectResponse.cookies.delete(TERMS_CONSENT_COOKIE_NAME);
  return redirectResponse;
}

export async function GET(request: NextRequest) {
  // Fail closed to /login instead of a 500 on unexpected exceptions such as missing env vars
  // (including
  // createAdminSupabaseClient() throwing), same policy as proxy.ts. Details are logged only. These
  // don't show up
  // as 5xx in monitoring, so detect them via the log tag.
  try {
    return await handleCallback(request);
  } catch (error) {
    console.error("[auth/callback] 予期しないエラー:", error);
    return redirectWithoutSession(new URL("/login", new URL(request.url).origin));
  }
}

async function handleCallback(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return redirectWithoutSession(new URL("/login", origin));
  }

  const cookiesToReturn: CookieToSet[] = [];
  const headersToReturn: Record<string, string> = {};

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Fail closed to /login on missing env vars (values never go to the response or logs).
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    return redirectWithoutSession(new URL("/login", origin));
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[], headers: Record<string, string>) {
        cookiesToReturn.push(...cookiesToSet);
        Object.assign(headersToReturn, headers);
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("セッション交換エラー:", error);
    return redirectWithoutSession(new URL("/login", origin));
  }

  const user = data.session.user;

  // SELECT RLS requires is_deleted=false even for one's own row, so the normal client can't see
  // soft-deleted
  // records, and a re-login INSERT would then hit the UNIQUE constraint. Check existence with
  // service_role without
  // filtering on is_deleted; the INSERT itself uses the normal client. A throw from a missing
  // SUPABASE_SERVICE_ROLE_KEY is caught by GET's catch and fails closed to /login.
  const adminSupabase = await createAdminSupabaseClient();
  const { data: existingUser, error: userError } = await adminSupabase
    .from("users")
    .select("id, status, is_deleted")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (userError) {
    console.error("ユーザー確認エラー:", userError);
    return redirectWithoutSession(new URL("/login", origin));
  }

  if (existingUser?.is_deleted) {
    console.error("論理削除済みユーザーの再ログイン:", user.id);
    return redirectWithoutSession(new URL(REGISTRATION_FAILED_PATH, origin));
  }

  let redirectPath = "/";

  if (!existingUser) {
    // First login: don't create a users row without the consent cookie (prevents bypassing the
    // consent step).
    // Existing-user branches never read the cookie.
    const hasConsented =
      request.cookies.get(TERMS_CONSENT_COOKIE_NAME)?.value === TERMS_CONSENT_COOKIE_VALUE;
    if (!hasConsented) {
      return redirectWithoutSession(new URL(TERMS_REQUIRED_PATH, origin));
    }

    const { error: insertError } = await supabase.from("users").insert({
      auth_id: user.id,
      email: user.email || "",
      display_name: user.user_metadata?.full_name || user.email || "",
      avatar_url: user.user_metadata?.avatar_url || null,
      role: USER_ROLE.MEMBER,
      status: USER_STATUS.TRIAL,
      terms_accepted_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("ユーザー自動登録エラー:", insertError);
      return redirectWithoutSession(new URL(REGISTRATION_FAILED_PATH, origin));
    }

    const adminUsersUrl = `${origin}/admin/users`;
    void sendSlackNewUserNotification({
      displayName: user.user_metadata?.full_name || user.email || "",
      email: user.email || "",
      adminUsersUrl,
    }).catch((error) => {
      console.error("[Slack通知] 予期しないエラーが発生しました:", error);
    });
    scheduleSignupEmail({ authId: user.id });

    redirectPath = "/";
  } else if (existingUser.status === USER_STATUS.REJECTED) {
    redirectPath = "/rejected";
  }

  return redirectWithSessionCookies(
    new URL(redirectPath, origin),
    cookiesToReturn,
    headersToReturn
  );
}
