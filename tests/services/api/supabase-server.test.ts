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

import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("createAdminSupabaseClient", () => {
  it("SUPABASE_SERVICE_ROLE_KEY が設定されている場合、同一インスタンスをキャッシュして返す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    const fakeClient = { name: "admin-client" };
    mockCreateClient.mockReturnValue(fakeClient);

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
});
