import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/slack");

import { createServerClient } from "@supabase/ssr";
import { GET } from "@/app/auth/callback/route";
import { TERMS_CONSENT_COOKIE_NAME, TERMS_CONSENT_COOKIE_VALUE } from "@/app/constants/auth";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { sendSlackNewUserNotification } from "@/app/services/notifications/slack";

const AUTH_USER = {
  id: "auth-uuid-1",
  email: "new@example.com",
  user_metadata: { full_name: "新規ユーザー", avatar_url: "https://example.com/avatar.png" },
};

function callbackRequest(code = "oauth-code") {
  return new NextRequest(`http://localhost/auth/callback?code=${code}`);
}

function callbackRequestWithConsent(code = "oauth-code") {
  return new NextRequest(`http://localhost/auth/callback?code=${code}`, {
    headers: { cookie: `${TERMS_CONSENT_COOKIE_NAME}=${TERMS_CONSENT_COOKIE_VALUE}` },
  });
}

function createSessionClient({ insertError = null }: { insertError?: unknown } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: { user: AUTH_USER } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({ insert }),
    insert,
  };
}

function createAdminClient({
  existingUser = null,
  existingUserError = null,
}: {
  existingUser?: { id: number; status: string; is_deleted: boolean } | null;
  existingUserError?: unknown;
} = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existingUser, error: existingUserError }),
    }),
  };
}

// @supabase/ssr がセッション Cookie 書き込み時に setAll へ渡すヘッダー（CDN キャッシュ防止）
const SESSION_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

function mockSessionClient(sessionClient: ReturnType<typeof createSessionClient>) {
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    options?.cookies.setAll?.(
      [{ name: "sb-access-token", value: "token", options: { path: "/" } }],
      SESSION_RESPONSE_HEADERS
    );
    return sessionClient as never;
  });
}

function setCookieHeader(res: Response) {
  return res.headers.get("set-cookie");
}

function setCookieHeaders(res: Response) {
  return res.headers.getSetCookie();
}

/** 同意 Cookie の削除指示（Max-Age=0 または過去の Expires）が Set-Cookie に含まれること */
function expectConsentCookieDeleted(res: Response) {
  expect(setCookieHeaders(res).join("\n")).toMatch(
    new RegExp(`${TERMS_CONSENT_COOKIE_NAME}=;|${TERMS_CONSENT_COOKIE_NAME}=,`)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.mocked(sendSlackNewUserNotification).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  // console.error の spy をアサーション失敗時も確実に戻す
  vi.restoreAllMocks();
});

describe("GET /auth/callback", () => {
  it("同意 Cookie ありの初回登録は / へリダイレクトし、Slack 新規ユーザー通知を呼び出す", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    const res = await GET(callbackRequestWithConsent());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(sendSlackNewUserNotification).toHaveBeenCalled();
    expect(setCookieHeader(res)).toContain("sb-access-token=token");
    // セッション Cookie を含む応答には ssr が渡した Cache-Control 等が転写される
    expect(res.headers.get("cache-control")).toBe(SESSION_RESPONSE_HEADERS["Cache-Control"]);
    expect(res.headers.get("pragma")).toBe("no-cache");
    expectConsentCookieDeleted(res);
  });

  it("同意 Cookie ありの初回登録は terms_accepted_at 付きで INSERT する", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    await GET(callbackRequestWithConsent());

    expect(sessionClient.insert).toHaveBeenCalledOnce();
    const payload = vi.mocked(sessionClient.insert).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.auth_id).toBe(AUTH_USER.id);
    expect(typeof payload.terms_accepted_at).toBe("string");
  });

  it("insert 失敗時は /login?error=registration_failed へリダイレクトし、通知もセッション Cookie も付けない", async () => {
    const sessionClient = createSessionClient({ insertError: { message: "insert failed" } });
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    const res = await GET(callbackRequestWithConsent());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=registration_failed");
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
    expectConsentCookieDeleted(res);
  });

  it("同意 Cookie なしの初回登録は INSERT せず /login?error=terms_required へ戻す", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=terms_required");
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
    expectConsentCookieDeleted(res);
  });

  it("既存ユーザーは同意 Cookie の有無に関わらず / へリダイレクトし users を更新しない", async () => {
    for (const request of [callbackRequest(), callbackRequestWithConsent()]) {
      vi.clearAllMocks();
      const sessionClient = createSessionClient();
      mockSessionClient(sessionClient);
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(
        createAdminClient({
          existingUser: { id: 1, status: "trial", is_deleted: false },
        }) as never
      );

      const res = await GET(request);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/");
      expect(sessionClient.insert).not.toHaveBeenCalled();
      expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
      expectConsentCookieDeleted(res);
    }
  });

  it("却下済みの既存ユーザーは同意 Cookie の有無に関わらず /rejected へリダイレクトする", async () => {
    for (const request of [callbackRequest(), callbackRequestWithConsent()]) {
      vi.clearAllMocks();
      const sessionClient = createSessionClient();
      mockSessionClient(sessionClient);
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(
        createAdminClient({
          existingUser: { id: 1, status: "rejected", is_deleted: false },
        }) as never
      );

      const res = await GET(request);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/rejected");
      expect(sessionClient.insert).not.toHaveBeenCalled();
      expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
      expectConsentCookieDeleted(res);
    }
  });

  it("論理削除済みユーザーの再ログインでは insert を試行せず、同じエラー導線へ流す", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createAdminClient({
        existingUser: { id: 1, status: "trial", is_deleted: true },
      }) as never
    );

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=registration_failed");
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
    expectConsentCookieDeleted(res);
  });

  it("存在確認が失敗したときは insert せず、error なしの /login へフェイルクローズする", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createAdminClient({ existingUserError: { message: "db error" } }) as never
    );

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
    expectConsentCookieDeleted(res);
  });

  it("createAdminSupabaseClient が throw した場合（キー未設定）は insert せず、error なしの /login へフェイルクローズする", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(
      new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません")
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    for (const request of [callbackRequest(), callbackRequestWithConsent()]) {
      const res = await GET(request);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
      expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
      expectConsentCookieDeleted(res);
      // 例外の内容（キー名など）はレスポンスに出さない
      expect(await res.text()).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("SUPABASE_SERVICE_ROLE_KEY 未設定時は 500 にせず /login へフェイルクローズする", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const actual = await vi.importActual<typeof import("@/app/services/api/supabase-server")>(
      "@/app/services/api/supabase-server"
    );
    // 後続テストへ実装を持ち越さないよう1回限りで差し替える
    vi.mocked(createAdminSupabaseClient).mockImplementationOnce(actual.createAdminSupabaseClient);
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(callbackRequestWithConsent());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).not.toContain("sb-access-token=token");
    expectConsentCookieDeleted(res);
    expect(consoleError).toHaveBeenCalled();
  });
});
