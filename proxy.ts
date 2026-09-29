import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_HEADER_NAMES, AUTH_HEADERS } from "./app/constants/auth";
import { ALLOWED_USER_STATUSES, USER_STATUS } from "./app/constants/user";
import type { UserStatusType } from "./app/types";

// Extensions treated as static assets (suffix match only). Don't use "path contains .": crafted
// URLs like
// /learn/1/2/3/4. would bypass auth.
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

function sanitizeRequestHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  for (const headerName of AUTH_HEADER_NAMES) {
    sanitized.delete(headerName);
  }
  return sanitized;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip x-sinlab-* from every request, including skipped ones, to prevent external header
  // spoofing.
  const sanitizedHeaders = sanitizeRequestHeaders(request.headers);

  if (shouldSkipMiddleware(pathname)) {
    return NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail closed (to /login) when the auth gate can't run. /login is skipped by
  // shouldSkipMiddleware, so no
  // redirect loop.
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[proxy] Missing env vars:",
      !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : "",
      !supabaseKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : ""
    );
    return NextResponse.redirect(new URL("/login", request.url));
  }

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
          // Responses that rewrite session cookies must not be cached by a CDN (@supabase/ssr
          // passes
          // Cache-Control: private, no-store etc.); omitting this could serve someone else's token.
          Object.assign(responseHeadersToSet, newHeaders);
        },
      },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, status, role")
      .eq("auth_id", user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    // Fail closed (to /login) when the status can't be determined, so a transient DB failure
    // (userStatus null)
    // never lets a request through.
    if (userError || !userData) {
      console.error("[proxy] User data fetch error:", userError);
      return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
    }

    const userStatus = userData.status as UserStatusType;

    // Allowlist: only active/trial pass; everything else redirects by status (an unexpected status
    // value is never
    // let through).
    if (ALLOWED_USER_STATUSES.includes(userStatus)) {
      // The retired /pending screen: redirect old URLs to /.
      if (pathname === "/pending") {
        return applyResponseModifications(NextResponse.redirect(new URL("/", request.url)));
      }

      // Build downstream headers from the latest request.headers after the token refresh.
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

    console.error("[proxy] Unknown user status:", userStatus);
    return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
  } catch (e) {
    console.error("[proxy] Unhandled error:", e);
    return applyResponseModifications(NextResponse.redirect(new URL("/login", request.url)));
  }
}

export const config = {
  matcher: [
    // Exclude Next.js internals and static assets (matching STATIC_FILE_EXTENSIONS).
    "/((?!_next|[^?]*\\.(?:html?|css|m?js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|pdf|txt|xml|map|webmanifest)).*)",
  ],
};
