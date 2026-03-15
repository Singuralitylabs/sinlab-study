import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import {
  fetchUserInfoByAuthId,
  fetchUserStatusByIdInServer,
} from "@/app/services/api/users-server";

const dbError = { message: "db error", code: "PGRST001" };
const authId = "auth-uuid-001";

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchUserStatusByIdInServer
// ----------------------------------------------------------------
describe("fetchUserStatusByIdInServer", () => {
  it("正常時、ユーザーのステータスを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { status: "active" }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserStatusByIdInServer({ authId });

    expect(result.status).toBe("active");
    expect(result.error).toBeNull();
  });

  it("DB エラー時、status: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserStatusByIdInServer({ authId });

    expect(result.status).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("データが見つからない場合、status: null を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserStatusByIdInServer({ authId });

    expect(result.status).toBeNull();
  });

  it("pending ステータスのユーザーを正しく返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { status: "pending" }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserStatusByIdInServer({ authId });

    expect(result.status).toBe("pending");
  });
});

// ----------------------------------------------------------------
// fetchUserInfoByAuthId
// ----------------------------------------------------------------
describe("fetchUserInfoByAuthId", () => {
  it("正常時、ユーザーの id と role を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { id: 1, role: "member" }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserInfoByAuthId({ authId });

    expect(result.id).toBe(1);
    expect(result.role).toBe("member");
    expect(result.error).toBeNull();
  });

  it("admin ロールのユーザーを正しく返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { id: 2, role: "admin" }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserInfoByAuthId({ authId });

    expect(result.id).toBe(2);
    expect(result.role).toBe("admin");
  });

  it("DB エラー時、id: 0, role: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserInfoByAuthId({ authId });

    expect(result.id).toBe(0);
    expect(result.role).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("データが見つからない場合、id: 0, role: null を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserInfoByAuthId({ authId });

    expect(result.id).toBe(0);
    expect(result.role).toBeNull();
  });
});
