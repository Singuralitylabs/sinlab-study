import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "./app/constants/user";

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイル・認証ページなどはスキップ
  if (shouldSkipMiddleware(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
          headers: Record<string, string>
        ) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
          // セッション Cookie を書き換えた応答は CDN にキャッシュさせない（@supabase/ssr が
          // Cache-Control: private, no-store 等を渡してくる）。省くと他人のトークンが配信されうる
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    });

    // ユーザー確認
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // 未認証の場合はログインページにリダイレクト
    if (error || !user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 認証済みユーザーのステータスを確認
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("status")
      .eq("auth_id", user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    // ステータスを判定できない場合はフェイルクローズ（/login へ）。
    // DB一時障害などで userStatus が null になった際に誤って通過させないため
    if (userError || !userData) {
      console.error("[proxy] User data fetch error:", userError);
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const userStatus = userData.status as string | null;

    // 許可リスト方式: active / pending（お試しユーザー）のみ通過させ、それ以外はステータスに応じてリダイレクト
    // （想定外のステータス値が入った場合も素通りさせない）
    if (userStatus === USER_STATUS.ACTIVE || userStatus === USER_STATUS.PENDING) {
      // 廃止済みの /pending 画面への旧URL流入は / へ誘導する
      if (pathname === "/pending") {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return response;
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.redirect(new URL("/rejected", request.url));
    }

    // 未知のステータスは /login へ（フェイルクローズ）
    console.error("[proxy] Unknown user status:", userStatus);
    return NextResponse.redirect(new URL("/login", request.url));
  } catch (e) {
    console.error("[proxy] Unhandled error:", e);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
