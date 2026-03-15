import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

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

    it("pending な admin ユーザーの場合、そのステータスとロールを返す", async () => {
      const mockClient = createMockSupabaseClient({
        authResult: { data: { user: mockUser }, error: null },
        queryResult: { data: { id: 2, status: "pending", role: "admin" }, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await getServerAuth();

      expect(result.userId).toBe(2);
      expect(result.userStatus).toBe("pending");
      expect(result.userRole).toBe("admin");
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
  });
});
