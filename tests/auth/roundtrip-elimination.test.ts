import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// proxy と getServerAuth を組み合わせたエンドツーエンドのフロー検証
// 1回のナビゲーションで users SELECT が 1 回のみ実行されること、
// および API Route では偽装ヘッダーが削除され自前で 1 回実行されることを検証する

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

let downstreamHeaders = new Headers();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => downstreamHeaders),
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));

vi.mock("@/app/services/api/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { AUTH_HEADERS } from "@/app/constants/auth";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { proxy } from "@/proxy";
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

const testAuthUser = {
  id: "test-auth-uuid-100",
  email: "test@example.com",
};

const testUserData = {
  id: 100,
  status: "active",
  role: "member",
};

/** proxy が下流に渡す request.headers を抽出して downstreamHeaders にセット */
function extractDownstreamHeaders(proxyResponseHeaders: Headers): Headers {
  const passedHeaders = new Headers();
  const authId = proxyResponseHeaders.get("x-middleware-request-x-sinlab-auth-id");
  const userId = proxyResponseHeaders.get("x-middleware-request-x-sinlab-user-id");
  const userStatus = proxyResponseHeaders.get("x-middleware-request-x-sinlab-user-status");
  const userRole = proxyResponseHeaders.get("x-middleware-request-x-sinlab-user-role");

  if (authId) passedHeaders.set(AUTH_HEADERS.AUTH_ID, authId);
  if (userId) passedHeaders.set(AUTH_HEADERS.USER_ID, userId);
  if (userStatus) passedHeaders.set(AUTH_HEADERS.USER_STATUS, userStatus);
  if (userRole) passedHeaders.set(AUTH_HEADERS.USER_ROLE, userRole);
  return passedHeaders;
}

describe("認証チェックの二重ラウンドトリップ解消フロー統合検証", () => {
  it("認証済みページ 1 回のナビゲーションで users SELECT が proxy 側の 1 回のみ実行され、getServerAuth 側では実行されないこと", async () => {
    // 1. proxy のモック設定
    let proxyUsersQueryCount = 0;
    const mockProxyClient = createMockSupabaseClient({
      authResult: { data: { user: testAuthUser }, error: null },
      queryResult: { data: testUserData, error: null },
    });
    const originalProxyFrom = mockProxyClient.from;
    mockProxyClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "users") {
        proxyUsersQueryCount++;
      }
      return originalProxyFrom(table);
    });

    const { createServerClient } = await import("@supabase/ssr");
    vi.mocked(createServerClient).mockReturnValue(mockProxyClient as never);

    // 2. proxy 実行
    const initialRequest = new NextRequest("http://localhost/dashboard");
    const proxyResponse = await proxy(initialRequest);

    expect(proxyResponse.status).toBe(200);
    expect(proxyUsersQueryCount).toBe(1);

    // proxyResponse から下流リクエストヘッダーを反映
    downstreamHeaders = extractDownstreamHeaders(proxyResponse.headers);

    // 3. 直後の RSC で getServerAuth 実行
    let rscUsersQueryCount = 0;
    const mockRscClient = createMockSupabaseClient({
      authResult: { data: { user: testAuthUser }, error: null },
      queryResult: { data: testUserData, error: null },
    });
    const originalRscFrom = mockRscClient.from;
    mockRscClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "users") {
        rscUsersQueryCount++;
      }
      return originalRscFrom(table);
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockRscClient as never);

    const authResult = await getServerAuth();

    // 4. 検証:
    // - ユーザー情報が正しく取得できていること
    expect(authResult).toEqual({
      user: testAuthUser,
      userId: 100,
      userStatus: "active",
      userRole: "member",
    });
    // - proxy 側で 1 回実行
    expect(proxyUsersQueryCount).toBe(1);
    // - RSC（getServerAuth）側では users SELECT が 0 回（省略）
    expect(rscUsersQueryCount).toBe(0);
    // - 合計で 1 回になっていること
    expect(proxyUsersQueryCount + rscUsersQueryCount).toBe(1);
  });

  it("API Route など proxy をスキップする経路に偽装ヘッダーが送られても proxy で削除され、getServerAuth 側で DB から正しく自前取得すること", async () => {
    // クライアントが悪意を持って admin ロールを偽装したヘッダーを送信
    const maliciousHeaders = new Headers();
    maliciousHeaders.set(AUTH_HEADERS.AUTH_ID, testAuthUser.id);
    maliciousHeaders.set(AUTH_HEADERS.USER_ID, "999");
    maliciousHeaders.set(AUTH_HEADERS.USER_STATUS, "active");
    maliciousHeaders.set(AUTH_HEADERS.USER_ROLE, "admin");

    const apiRequest = new NextRequest("http://localhost/api/admin/users", {
      headers: maliciousHeaders,
    });
    const proxyResponse = await proxy(apiRequest);

    expect(proxyResponse.status).toBe(200);
    // proxy を通過したリクエストヘッダーから偽装ヘッダーが削除されていること
    expect(proxyResponse.headers.get("x-middleware-request-x-sinlab-auth-id")).toBeNull();
    expect(proxyResponse.headers.get("x-middleware-request-x-sinlab-user-role")).toBeNull();

    // Route Handler（/api/*）に届いたヘッダー（偽装ヘッダー削除済み）
    downstreamHeaders = extractDownstreamHeaders(proxyResponse.headers);

    let apiUsersQueryCount = 0;
    const mockApiClient = createMockSupabaseClient({
      authResult: { data: { user: testAuthUser }, error: null },
      queryResult: { data: testUserData, error: null }, // DB には member として登録されている
    });
    const originalApiFrom = mockApiClient.from;
    mockApiClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "users") {
        apiUsersQueryCount++;
      }
      return originalApiFrom(table);
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockApiClient as never);

    const authResult = await getServerAuth();

    // 偽装された admin ではなく、DB から取得された正規の member であること
    expect(authResult).toEqual({
      user: testAuthUser,
      userId: 100,
      userStatus: "active",
      userRole: "member",
    });
    expect(apiUsersQueryCount).toBe(1);
  });
});
