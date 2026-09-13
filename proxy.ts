import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_HEADER_NAMES, AUTH_HEADERS } from "./app/constants/auth";
import { ALLOWED_USER_STATUSES, USER_STATUS } from "./app/constants/user";
import type { UserStatusType } from "./app/types";

// 静的アセットとして扱う拡張子（末尾一致のみ）。
// 「パスに . を含む」という判定は /learn/1/2/3/4. のような細工URLで認証をすり抜けられるため使用しない
const STATIC_FILE_EXTENSIONS =
  /\.(?:html?|css|m?js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|pdf|txt|xml|map|webmanifest)$/i;

function shouldSkipMiddleware(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/demo") ||
    STATIC_FILE_EXTENSIONS.test(pathname) ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/rejected"
  );
}

/** 受信ヘッダーから x-sinlab-* 認証情報ヘッダーを削除した安全な Headers を作成 */
function sanitizeRequestHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  for (const headerName of AUTH_HEADER_NAMES) {
    sanitized.delete(headerName);
  }
  return sanitized;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 外部からのヘッダー偽装を防ぐため、スキップ対象を含む全リクエストで x-sinlab-* を削除
  const sanitizedHeaders = sanitizeRequestHeaders(request.headers);

  // 静的ファイル・API・認証ページなどはスキップ（サニタイズ済みヘッダーを渡す）
  if (shouldSkipMiddleware(pathname)) {
    return NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });
  }

  // 環境変数の存在チェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // 認証ゲートを通せない場合はフェイルクローズ（/login へ）とする。
  // /login は shouldSkipMiddleware の対象のためリダイレクトループは発生しない
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[proxy] Missing env vars:",
      !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : "",
      !supabaseKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : ""
    );
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // セッション更新時に発行される Set-Cookie とレスポンスヘッダー（Cache-Control 等）を保持
  type CookieToSet = { name: string; value: string; options: CookieOptions };
  const cookiesToSet: CookieToSet[] = [];
  const responseHeadersToSet: Record<string, string> = {};

  const applyResponseModifications = <T extends NextResponse>(response: T): T => {
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, options);
    }
    for (const [key, value] of Object.entries(responseHeadersToSet)) {
      response.headers.set(key, value);
    }
    return response;
  };

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(newCookies, newHeaders) {
          for (const cookie of newCookies) {
            request.cookies.set(cookie.name, cookie.value);
            cookiesToSet.push(cookie);
          }
          // セッション Cookie を書き換えた応答は CDN にキャッシュさせない（@supabase/ssr が
          // Cache-Control: private, no-store 等を渡してくる）。省くと他人のトークンが配信されうる
          Object.assign(responseHeadersToSet, newHeaders);
        },
      },
    });

    // ユーザー確認（トークン更新が発生した場合は request.cookies.set() で同期済み）
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // 未認証の場合はログインページにリダイレクト
    if (error || !user) {
      return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
    }

    // 認証済みユーザーのステータスとロール・IDを確認
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, status, role")
      .eq("auth_id", user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    // ステータスを判定できない場合はフェイルクローズ（/login へ）。
    // DB一時障害などで userStatus が null になった際に誤って通過させないため
    if (userError || !userData) {
      console.error("[proxy] User data fetch error:", userError);
      return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
    }

    const userStatus = userData.status as UserStatusType;

    // 許可リスト方式: active / trial（お試しユーザー）のみ通過させ、それ以外はステータスに応じてリダイレクト
    // （想定外のステータス値が入った場合も素通りさせない）
    if (ALLOWED_USER_STATUSES.includes(userStatus)) {
      // 廃止済みの /pending 画面への旧URL流入は / へ誘導する
      if (pathname === "/pending") {
        return applyResponseModifications(NextResponse.redirect(new URL("/", request.url)));
      }

      // トークン更新後の最新の request.headers をベースに下流リクエストヘッダーを構築
      const downstreamHeaders = sanitizeRequestHeaders(request.headers);
      downstreamHeaders.set(AUTH_HEADERS.AUTH_ID, user.id);
      downstreamHeaders.set(AUTH_HEADERS.USER_ID, String(userData.id));
      downstreamHeaders.set(AUTH_HEADERS.USER_STATUS, userData.status);
      downstreamHeaders.set(AUTH_HEADERS.USER_ROLE, userData.role);

      return applyResponseModifications(
        NextResponse.next({
          request: {
            headers: downstreamHeaders,
          },
        })
      );
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return applyResponseModifications(NextResponse.redirect(new URL("/rejected", request.url)));
    }

    // 未知のステータスは /login へ（フェイルクローズ）
    console.error("[proxy] Unknown user status:", userStatus);
    return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
  } catch (e) {
    console.error("[proxy] Unhandled error:", e);
    return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
  }
}

export const config = {
  matcher: [
    // Next.js の内部パスおよび静的アセット（STATIC_FILE_EXTENSIONS と一致）を除外
    "/((?!_next|[^?]*\\.(?:html?|css|m?js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|pdf|txt|xml|map|webmanifest)).*)",
  ],
};
