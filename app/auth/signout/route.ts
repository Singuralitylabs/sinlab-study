import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const LOGIN_PATH = "/login";

// Session cookie names written by @supabase/ssr (`sb-<ref>-auth-token`, chunked as `.0`, `.1`...).
const SESSION_COOKIE_PATTERN = /^sb-.*-auth-token(?:\.\d+)?$/;

/**
 * Only same-origin callers may sign the user out. Browsers always send Origin on a cross-site
 * POST, so a missing header means a same-origin or non-browser request.
 */
function isCrossOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

/**
 * Clearing the session cookies does not depend on `signOut()` succeeding: an Auth outage must
 * still leave the browser logged out (fail closed), so every known session cookie is expired
 * explicitly and @supabase/ssr's own removals are applied on top.
 */
function buildRedirect(
  request: NextRequest,
  cookies: CookieToSet[],
  headers: Record<string, string>
): NextResponse {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, new URL(request.url).origin), 303);
  for (const { name } of request.cookies.getAll()) {
    if (SESSION_COOKIE_PATTERN.test(name)) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }
  for (const { name, value, options } of cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  // Never let a CDN cache a response that rewrites session cookies.
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  return response;
}

export async function POST(request: NextRequest) {
  if (isCrossOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookiesToReturn: CookieToSet[] = [];
  const headersToReturn: Record<string, string> = {};

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    // Values never go to the response or logs. The cookies are still cleared below.
    if (!supabaseUrl || !supabaseKey) {
      console.error(
        "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      );
      return buildRedirect(request, cookiesToReturn, headersToReturn);
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

    // Global scope (the client-side default this replaces): revokes the refresh token on every
    // device, not only this browser.
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[auth/signout] サインアウトエラー:", error.message);
    }
  } catch (error) {
    console.error("[auth/signout] 予期しないエラー:", error);
  }

  return buildRedirect(request, cookiesToReturn, headersToReturn);
}
