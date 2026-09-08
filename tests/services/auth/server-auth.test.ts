import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";
import { AUTH_HEADERS } from "@/app/constants/auth";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const mockUser = {
  id: "auth-uuid-001",
  email: "test@example.com",
};

const mockUserData = {
  id: 1,
  status: "active",
  role: "member",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers());
});

describe("getServerAuth", () => {
  describe("認証エラー時", () => {
    it("authError がある場合、全フィールドが null の結果を返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: null }, error: new Error("auth error") },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: null,
        userId: null,
        userStatus: null,
        userRole: null,
      });
    });

    it("user が null の場合、全フィールドが null の結果を返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: null }, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: null,
        userId: null,
        userStatus: null,
        userRole: null,
      });
    });
  });

  describe("認証成功・DB エラー時", () => {
    it("users テーブルの取得でエラーが発生した場合、user のみ設定し他は null でエラーメッセージを返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: null, error: { message: "db error" } },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result.user).toEqual(mockUser);
      expect(result.userId).toBeNull();
      expect(result.userStatus).toBeNull();
      expect(result.userRole).toBeNull();
      expect(result.error).toBe("ユーザー情報が見つかりません");
    });

    it("users テーブルにデータがない場合、user のみ設定し他は null でエラーメッセージを返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: null, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result.user).toEqual(mockUser);
      expect(result.userId).toBeNull();
      expect(result.error).toBe("ユーザー情報が見つかりません");
    });
  });

  describe("認証成功・DB 取得成功時", () => {
    it("active な member ユーザーの場合、全フィールドを返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
    });

    it("trial な admin ユーザーの場合、そのステータスとロールを返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: { id: 2, status: "trial", role: "admin" }, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result.userId).toBe(2);
      expect(result.userStatus).toBe("trial");
      expect(result.userRole).toBe("admin");
    });
  });

  describe("proxy からのヘッダー経由（案Aのキャッシュ利用）", () => {
    it("有効なヘッダーが揃っており auth.getUser().id と一致する場合、users テーブルを照会せずヘッダー値から結果を返す", async () => {
      const requestHeaders = new Headers();
      requestHeaders.set(AUTH_HEADERS.AUTH_ID, mockUser.id);
      requestHeaders.set(AUTH_HEADERS.USER_ID, "10");
      requestHeaders.set(AUTH_HEADERS.USER_STATUS, "active");
      requestHeaders.set(AUTH_HEADERS.USER_ROLE, "maintainer");
      vi.mocked(headers).mockResolvedValue(requestHeaders);

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 10,
        userStatus: "active",
        userRole: "maintainer",
      });
      // users テーブルへの照会が行われていないこと（二重ラウンドトリップ解消）
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it("ヘッダーの auth_id と auth.getUser() の user.id が不一致の場合、ヘッダーを無視して DB から取得する", async () => {
      const requestHeaders = new Headers();
      requestHeaders.set(AUTH_HEADERS.AUTH_ID, "forged-auth-id");
      requestHeaders.set(AUTH_HEADERS.USER_ID, "999");
      requestHeaders.set(AUTH_HEADERS.USER_STATUS, "active");
      requestHeaders.set(AUTH_HEADERS.USER_ROLE, "admin");
      vi.mocked(headers).mockResolvedValue(requestHeaders);

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });

    it("ヘッダーのステータスが無効な値の場合、ヘッダーを無視して DB から取得する", async () => {
      const requestHeaders = new Headers();
      requestHeaders.set(AUTH_HEADERS.AUTH_ID, mockUser.id);
      requestHeaders.set(AUTH_HEADERS.USER_ID, "1");
      requestHeaders.set(AUTH_HEADERS.USER_STATUS, "invalid_status");
      requestHeaders.set(AUTH_HEADERS.USER_ROLE, "member");
      vi.mocked(headers).mockResolvedValue(requestHeaders);

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });

    it("ヘッダーのロールが無効な値の場合、ヘッダーを無視して DB から取得する", async () => {
      const requestHeaders = new Headers();
      requestHeaders.set(AUTH_HEADERS.AUTH_ID, mockUser.id);
      requestHeaders.set(AUTH_HEADERS.USER_ID, "1");
      requestHeaders.set(AUTH_HEADERS.USER_STATUS, "active");
      requestHeaders.set(AUTH_HEADERS.USER_ROLE, "superadmin");
      vi.mocked(headers).mockResolvedValue(requestHeaders);

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });

    it("headers() 呼び出しで例外が発生した場合（API Route等）、DB 照会へフォールバックする", async () => {
      vi.mocked(headers).mockRejectedValue(new Error("headers not available"));

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });

    it("ヘッダーが一切存在しない場合（API Routeなど proxy スキップ時）、自前で DB 照会する", async () => {
      vi.mocked(headers).mockResolvedValue(new Headers());

      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: mockUserData, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result).toEqual({
        user: mockUser,
        userId: 1,
        userStatus: "active",
        userRole: "member",
      });
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });
  });

  describe("例外発生時", () => {
    it("createServerSupabaseClient が例外をスローした場合、エラーメッセージ付きで全フィールドが null の結果を返す", async () => {
      vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("unexpected error"));

      const result = await getServerAuth();

      expect(result).toEqual({
        user: null,
        userId: null,
        userStatus: null,
        userRole: null,
        error: "サーバー認証エラーが発生しました",
      });
    });

    it("digest を持つ Next.js 制御エラーは握り潰さずそのまま再スローする", async () => {
      // force-dynamic が外れた際の静的プリレンダー事故を防ぐため、
      // DYNAMIC_SERVER_USAGE 等の Next.js 制御エラーは catch で飲み込まない
      const controlError = Object.assign(new Error("Dynamic server usage"), {
        digest: "DYNAMIC_SERVER_USAGE",
      });
      vi.mocked(createServerSupabaseClient).mockRejectedValue(controlError);

      await expect(getServerAuth()).rejects.toBe(controlError);
    });
  });
});
