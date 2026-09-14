import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockCreateServerClient = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // createAdminSupabaseClient のモジュールレベルキャッシュ（cachedAdminClient）をクリアする
  vi.resetModules();
});

describe("createAdminSupabaseClient", () => {
  it("SUPABASE_SERVICE_ROLE_KEY が設定されている場合、同一インスタンスをキャッシュして返す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    const fakeClient = { name: "admin-client" };
    mockCreateClient.mockReturnValue(fakeClient);

    const { createAdminSupabaseClient } = await import("@/app/services/api/supabase-server");
    const client1 = await createAdminSupabaseClient();
    const client2 = await createAdminSupabaseClient();

    expect(client1).toBe(fakeClient);
    expect(client2).toBe(fakeClient);
    // モジュールレベルキャッシュにより createClient の呼び出しは初回のみ
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-secret"
    );
  });

  it("モジュール再読込後はキャッシュが消え、createClient が再度呼ばれる", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    mockCreateClient.mockReturnValue({ name: "admin-client-1" });

    const mod1 = await import("@/app/services/api/supabase-server");
    await mod1.createAdminSupabaseClient();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    vi.resetModules();
    mockCreateClient.mockClear();
    mockCreateClient.mockReturnValue({ name: "admin-client-2" });

    const mod2 = await import("@/app/services/api/supabase-server");
    await mod2.createAdminSupabaseClient();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it("SUPABASE_SERVICE_ROLE_KEY 未設定時は通常クライアントへフォールバックせず throw する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { createAdminSupabaseClient } = await import("@/app/services/api/supabase-server");

    await expect(createAdminSupabaseClient()).rejects.toThrow(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Service Role クライアントにはキーが必須です"
    );
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("未設定時のエラーメッセージにキー値らしき文字列を含めない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    // 空文字も未設定扱い。メッセージへキー文字列を埋め込まないことを確認する
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { createAdminSupabaseClient } = await import("@/app/services/api/supabase-server");

    try {
      await createAdminSupabaseClient();
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(message).not.toMatch(/service-role-secret|sk_live|sk_test|eyJ/);
    }
  });
});
