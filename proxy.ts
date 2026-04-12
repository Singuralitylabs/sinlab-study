import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "./app/constants/user";

function shouldSkipMiddleware(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/demo") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico" ||
    pathname === "/login" ||
    pathname === "/pending" ||
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

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[proxy] Missing env vars:",
      !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : "",
      !supabaseKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : ""
    );
    return response;
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
          }[]
        ) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
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

    if (userError) {
      console.error("[proxy] User data fetch error:", userError);
    }

    const userStatus = userData?.status as string | null;

    // ユーザーステータスに応じてリダイレクト
    if (!userStatus || userStatus === USER_STATUS.PENDING) {
      return NextResponse.redirect(new URL("/pending", request.url));
    }

    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.redirect(new URL("/rejected", request.url));
    }

    // activeユーザーは通常ページにアクセス可能
    return response;
  } catch (e) {
    console.error("[proxy] Unhandled error:", e);
    return response;
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
