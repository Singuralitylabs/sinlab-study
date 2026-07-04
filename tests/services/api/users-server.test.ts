import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { fetchUserStatusByIdInServer } from "@/app/services/api/users-server";

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
