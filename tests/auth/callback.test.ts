import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/slack");

import { createServerClient } from "@supabase/ssr";
import { GET } from "@/app/auth/callback/route";
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

function mockSessionClient(sessionClient: ReturnType<typeof createSessionClient>) {
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    options?.cookies.setAll?.(
      [{ name: "sb-access-token", value: "token", options: { path: "/" } }],
      {}
    );
    return sessionClient as never;
  });
}

function setCookieHeader(res: Response) {
  return res.headers.get("set-cookie");
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
});

describe("GET /auth/callback", () => {
  it("insert 成功時は / へリダイレクトし、Slack 新規ユーザー通知を呼び出す", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(sendSlackNewUserNotification).toHaveBeenCalled();
    expect(setCookieHeader(res)).toContain("sb-access-token=token");
  });

  it("insert 失敗時は /login?error=registration_failed へリダイレクトし、通知もセッション Cookie も付けない", async () => {
    const sessionClient = createSessionClient({ insertError: { message: "insert failed" } });
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(createAdminClient() as never);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=registration_failed");
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).toBeNull();
  });

  it("論理削除済みユーザーの再ログインでは insert を試行せず、同じエラー導線へ流す", async () => {
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createAdminClient({
        existingUser: { id: 1, status: "pending", is_deleted: true },
      }) as never
    );

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=registration_failed");
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).toBeNull();
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
    expect(setCookieHeader(res)).toBeNull();
  });

  it("SUPABASE_SERVICE_ROLE_KEY 未設定時は存在確認も insert もせず /login へフェイルクローズする", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const sessionClient = createSessionClient();
    mockSessionClient(sessionClient);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(sessionClient.insert).not.toHaveBeenCalled();
    expect(sendSlackNewUserNotification).not.toHaveBeenCalled();
    expect(setCookieHeader(res)).toBeNull();
  });
});
