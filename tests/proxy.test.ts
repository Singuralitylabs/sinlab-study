import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { AUTH_HEADERS } from "@/app/constants/auth";
import { config, proxy } from "@/proxy";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  };
});

afterEach(() => {
  process.env = originalEnv;
});

function mockProxySupabase({
  authUser = null,
  authError = null,
  userData = null,
  userError = null,
}: {
  authUser?: { id: string } | null;
  authError?: unknown;
  userData?: { id: number; status: string; role: string } | null;
  userError?: unknown;
} = {}) {
  const client = createMockSupabaseClient({
    authResult: { data: { user: authUser }, error: authError },
    queryResult: { data: userData, error: userError },
  });
  vi.mocked(createServerClient).mockReturnValue(client as never);
  return client;
}

describe("proxy", () => {
  describe("shouldSkipMiddleware (スキップ判定)", () => {
    it("/_next や /api などのパスは認証チェックをスキップして通過する", async () => {
      const req = new NextRequest("http://localhost/api/learning/contents");
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it("静的アセット（拡張子一致）はスキップする", async () => {
      const extensions = ["pdf", "txt", "xml", "map", "json", "png", "css", "js"];
      for (const ext of extensions) {
        const req = new NextRequest(`http://localhost/files/sample.${ext}`);
        const res = await proxy(req);
        expect(res.status).toBe(200);
      }
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it("/login や /rejected はスキップする", async () => {
      for (const path of ["/login", "/rejected"]) {
        const req = new NextRequest(`http://localhost${path}`);
        const res = await proxy(req);
        expect(res.status).toBe(200);
      }
      expect(createServerClient).not.toHaveBeenCalled();
    });

    it("スキップ対象パス（/api/* など）に偽装ヘッダーが付与されていても、下流には伝播せず削除されること", async () => {
      const headers = new Headers();
      headers.set(AUTH_HEADERS.AUTH_ID, "attacker-auth-id");
      headers.set(AUTH_HEADERS.USER_ID, "999");
      headers.set(AUTH_HEADERS.USER_STATUS, "active");
      headers.set(AUTH_HEADERS.USER_ROLE, "admin");

      const req = new NextRequest("http://localhost/api/admin/users", { headers });
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-request-x-sinlab-auth-id")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-sinlab-user-id")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-sinlab-user-status")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-sinlab-user-role")).toBeNull();
    });
  });

  describe("フェイルクローズ（エラー時の /login リダイレクト）", () => {
    it("環境変数が欠落している場合、/login へリダイレクトする", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("未認証の場合、/login へリダイレクトする", async () => {
      mockProxySupabase({ authUser: null });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("DB取得でエラーが発生した場合、/login へリダイレクトする", async () => {
      mockProxySupabase({
        authUser: { id: "user-123" },
        userError: new Error("DB error"),
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("ステータスが null / 存在しない場合、/login へリダイレクトする", async () => {
      mockProxySupabase({
        authUser: { id: "user-123" },
        userData: null,
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("予期せぬ例外が発生した場合、/login へリダイレクトする", async () => {
      vi.mocked(createServerClient).mockImplementation(() => {
        throw new Error("unexpected explosion");
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("未知のステータスの場合、/login へリダイレクトする", async () => {
      mockProxySupabase({
        authUser: { id: "user-123" },
        userData: { id: 1, status: "unknown_status", role: "member" },
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });
  });

  describe("ステータス別リダイレクト", () => {
    it("rejected ユーザーは /rejected へリダイレクトする", async () => {
      mockProxySupabase({
        authUser: { id: "user-123" },
        userData: { id: 1, status: "rejected", role: "member" },
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/rejected");
    });

    it("/pending へのアクセスは / へリダイレクトする", async () => {
      mockProxySupabase({
        authUser: { id: "user-123" },
        userData: { id: 1, status: "active", role: "member" },
      });

      const req = new NextRequest("http://localhost/pending");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/");
    });
  });

  describe("ヘッダー設定と偽装防止", () => {
    it("active ユーザーの場合、リクエストヘッダーにユーザー情報（auth_id, user_id, status, role）を設定して通過する", async () => {
      mockProxySupabase({
        authUser: { id: "auth-123" },
        userData: { id: 42, status: "active", role: "member" },
      });

      const req = new NextRequest("http://localhost/dashboard");
      const res = await proxy(req);

      expect(res.status).toBe(200);
      // 下流リクエストに渡されるヘッダーを検証
      const downstreamAuthId = res.headers.get("x-middleware-request-x-sinlab-auth-id");
      const downstreamUserId = res.headers.get("x-middleware-request-x-sinlab-user-id");
      const downstreamStatus = res.headers.get("x-middleware-request-x-sinlab-user-status");
      const downstreamRole = res.headers.get("x-middleware-request-x-sinlab-user-role");

      expect(downstreamAuthId).toBe("auth-123");
      expect(downstreamUserId).toBe("42");
      expect(downstreamStatus).toBe("active");
      expect(downstreamRole).toBe("member");
    });

    it("受信リクエストに含まれる偽装ヘッダーは削除され、正規の認証情報で上書きされる", async () => {
      mockProxySupabase({
        authUser: { id: "legit-auth-id" },
        userData: { id: 10, status: "active", role: "member" },
      });

      const headers = new Headers();
      headers.set(AUTH_HEADERS.AUTH_ID, "fake-auth-id");
      headers.set(AUTH_HEADERS.USER_ID, "999");
      headers.set(AUTH_HEADERS.USER_STATUS, "active");
      headers.set(AUTH_HEADERS.USER_ROLE, "admin");

      const req = new NextRequest("http://localhost/dashboard", { headers });
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-request-x-sinlab-auth-id")).toBe("legit-auth-id");
      expect(res.headers.get("x-middleware-request-x-sinlab-user-id")).toBe("10");
      expect(res.headers.get("x-middleware-request-x-sinlab-user-status")).toBe("active");
      expect(res.headers.get("x-middleware-request-x-sinlab-user-role")).toBe("member");
    });

    it("偽装ヘッダー付きで未認証リクエストが送られた場合、偽装ヘッダーで認証通過せず /login へリダイレクトする", async () => {
      mockProxySupabase({ authUser: null });

      const headers = new Headers();
      headers.set(AUTH_HEADERS.AUTH_ID, "fake-auth-id");
      headers.set(AUTH_HEADERS.USER_ID, "1");
      headers.set(AUTH_HEADERS.USER_STATUS, "active");
      headers.set(AUTH_HEADERS.USER_ROLE, "admin");

      const req = new NextRequest("http://localhost/dashboard", { headers });
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("ステータス取得エラー時、受信ヘッダーが偽装されていても /login へリダイレクトする（ヘッダーで素通りしない）", async () => {
      mockProxySupabase({
        authUser: { id: "legit-auth-id" },
        userData: null,
      });

      const headers = new Headers();
      headers.set(AUTH_HEADERS.AUTH_ID, "legit-auth-id");
      headers.set(AUTH_HEADERS.USER_ID, "1");
      headers.set(AUTH_HEADERS.USER_STATUS, "active");
      headers.set(AUTH_HEADERS.USER_ROLE, "admin");

      const req = new NextRequest("http://localhost/dashboard", { headers });
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("セッション更新（setAll）が発生した場合、更新後の Cookie が下流ヘッダーおよびレスポンス Cookie に反映されること", async () => {
      vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
        return {
          auth: {
            getUser: vi.fn().mockImplementation(async () => {
              // @supabase/ssr がトークン更新を検知して setAll を呼ぶ挙動を再現
              options.cookies?.setAll?.(
                [{ name: "sb-token", value: "new-token-value", options: { path: "/" } }],
                { "cache-control": "private, no-store" }
              );
              return { data: { user: { id: "auth-123" } }, error: null };
            }),
          },
          from: vi.fn().mockImplementation(() =>
            createMockSupabaseClient({
              queryResult: { data: { id: 1, status: "active", role: "member" }, error: null },
            }).from("users")
          ),
        } as never;
      });

      const req = new NextRequest("http://localhost/dashboard", {
        headers: { cookie: "old-session=token-1" },
      });
      const res = await proxy(req);

      expect(res.status).toBe(200);
      expect(res.cookies.get("sb-token")?.value).toBe("new-token-value");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      // 下流リクエストヘッダーに更新後 Cookie が含まれること
      const downstreamCookie = res.headers.get("x-middleware-request-cookie");
      expect(downstreamCookie).toContain("sb-token=new-token-value");
    });
  });

  describe("config.matcher", () => {
    it("matcher に /(api|trpc)(.*) が含まれていないこと", () => {
      expect(config.matcher).not.toContain("/(api|trpc)(.*)");
    });

    it("matcher の除外パターンが STATIC_FILE_EXTENSIONS と揃っていること", () => {
      const matcherRegex = new RegExp(config.matcher[0]);
      // 保護対象ページはマッチする（proxy が走る）
      expect(matcherRegex.test("/learn/1")).toBe(true);
      expect(matcherRegex.test("/dashboard")).toBe(true);
      expect(matcherRegex.test("/admin/users")).toBe(true);

      // 除外されるべき静的アセットパスはマッチしない
      expect(matcherRegex.test("/sample.pdf")).toBe(false);
      expect(matcherRegex.test("/sample.txt")).toBe(false);
      expect(matcherRegex.test("/sample.xml")).toBe(false);
      expect(matcherRegex.test("/sample.json")).toBe(false);
      expect(matcherRegex.test("/sample.map")).toBe(false);
      expect(matcherRegex.test("/_next/static/chunk.js")).toBe(false);
    });
  });
});
