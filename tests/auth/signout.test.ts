import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { POST } from "@/app/auth/signout/route";

const SESSION_COOKIE = "sb-abc-auth-token";

// Headers @supabase/ssr passes to setAll when rewriting session cookies.
const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
};

function signOutRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/auth/signout", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=token; ${SESSION_COOKIE}.1=chunk`, ...headers },
  });
}

/** Mimics @supabase/ssr: signOut() removes the session cookies through setAll. */
function mockClient({
  signOutResult = { error: null },
  signOutThrows = false,
  removesCookies = true,
}: {
  signOutResult?: { error: { message: string } | null };
  signOutThrows?: boolean;
  removesCookies?: boolean;
} = {}) {
  const signOut = vi.fn();
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    signOut.mockImplementation(async () => {
      if (signOutThrows) {
        throw new Error("network down");
      }
      if (removesCookies) {
        options?.cookies?.setAll?.(
          [{ name: SESSION_COOKIE, value: "", options: { path: "/", maxAge: 0 } }],
          SESSION_RESPONSE_HEADERS
        );
      }
      return signOutResult;
    });
    return { auth: { signOut } } as never;
  });
  return { signOut };
}

function expiredCookieNames(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((cookie) => /(?:^|;\s*)Max-Age=0(?:;|$)/i.test(cookie))
    .map((cookie) => cookie.split("=")[0]);
}

describe("POST /auth/signout", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(createServerClient).mockReset();
  });

  it("セッションを失効させ、Cookie を消して /login へ 303 で返す", async () => {
    const { signOut } = mockClient();
    const response = await POST(signOutRequest({ origin: "http://localhost" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(expiredCookieNames(response)).toEqual(
      expect.arrayContaining([SESSION_COOKIE, `${SESSION_COOKIE}.1`])
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("Origin が自オリジンと異なる POST は 403 でサインアウトしない", async () => {
    const { signOut } = mockClient();
    const response = await POST(signOutRequest({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("Auth 側が失敗しても（エラー応答・例外）、セッション Cookie は失効させる", async () => {
    for (const options of [
      { signOutResult: { error: { message: "boom" } }, removesCookies: false },
      { signOutThrows: true },
    ]) {
      mockClient(options);
      const response = await POST(signOutRequest());
      expect(response.status).toBe(303);
      expect(expiredCookieNames(response)).toEqual(
        expect.arrayContaining([SESSION_COOKIE, `${SESSION_COOKIE}.1`])
      );
    }
  });

  it("環境変数が欠けていても Cookie を失効させて /login へ返す（値はレスポンスに出さない）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await POST(signOutRequest());

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(expiredCookieNames(response)).toEqual(
      expect.arrayContaining([SESSION_COOKIE, `${SESSION_COOKIE}.1`])
    );
    expect(await response.text()).not.toContain("publishable");
  });
});
