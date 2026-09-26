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
  // 同意 Cookie は使い捨てのため、セッション付きの応答でも確実に削除する
  redirectResponse.cookies.delete(TERMS_CONSENT_COOKIE_NAME);
  // セッション Cookie を含む応答は CDN にキャッシュさせない（@supabase/ssr が渡す Cache-Control 等）
  for (const [key, value] of Object.entries(headers)) {
    redirectResponse.headers.set(key, value);
  }
  return redirectResponse;
}

/** セッション Cookie を付けないエラー導線のリダイレクト。同意 Cookie の削除のみ行う */
function redirectWithoutSession(url: URL) {
  const redirectResponse = NextResponse.redirect(url);
  redirectResponse.cookies.delete(TERMS_CONSENT_COOKIE_NAME);
  return redirectResponse;
}

export async function GET(request: NextRequest) {
  // 環境変数の欠落（createAdminSupabaseClient() の throw を含む）などの予期しない例外で
  // 500 にせず /login へフェイルクローズする（proxy.ts と同じ方針。例外の内容はログのみ）。
  // 監視上は 5xx として現れないため、ログのタグで検知する
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

  // cookieを蓄積するための配列
  const cookiesToReturn: CookieToSet[] = [];
  const headersToReturn: Record<string, string> = {};

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // 環境変数欠落時は 500 にせず /login へフェイルクローズする（値はレスポンス・ログに出さない）
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
        // cookie と付随ヘッダーを蓄積（後でリダイレクトレスポンスに設定する）
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

  // SELECT RLS は本人行でも is_deleted=false を要求するため、通常クライアントでは
  // 論理削除済みレコードが見えない。再ログインで INSERT すると UNIQUE 違反になるので、
  // 存在確認だけ service_role で行い is_deleted では絞らない。INSERT 自体は通常クライアント。
  // SUPABASE_SERVICE_ROLE_KEY 欠落時の throw は GET の catch で /login へフェイルクローズする。
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

  // リダイレクト先を決定
  let redirectPath = "/";

  if (!existingUser) {
    // 初回ログイン: 同意 Cookie なしには users 行を作らない（同意操作の迂回防止）。
    // 既存ユーザーの分岐では Cookie を参照しない。
    const hasConsented =
      request.cookies.get(TERMS_CONSENT_COOKIE_NAME)?.value === TERMS_CONSENT_COOKIE_VALUE;
    if (!hasConsented) {
      return redirectWithoutSession(new URL(TERMS_REQUIRED_PATH, origin));
    }

    // 初回ログイン: ユーザーを自動登録（同意日時を記録）
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

    // お試しユーザーとしてそのままダッシュボードへ（承認待ちはアプリ内バナーで通知）
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
