import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-client");

import { createClientSupabaseClient } from "@/app/services/api/supabase-client";
import { fetchUserIdByAuthId, fetchUserStatusById } from "@/app/services/api/users-client";

const dbError = { message: "db error", code: "PGRST001" };
const authId = "auth-uuid-001";

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchUserStatusById
// ----------------------------------------------------------------
describe("fetchUserStatusById", () => {
  it("正常時、ユーザーのステータスを返す", async () => {
    const mockClient = {
      from: vi
        .fn()
        .mockReturnValue(createQueryBuilder({ data: { status: "active" }, error: null })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserStatusById({ authId });

    expect(result.status).toBe("active");
    expect(result.error).toBeNull();
  });

  it("rejected ステータスのユーザーを正しく返す", async () => {
    const mockClient = {
      from: vi
        .fn()
        .mockReturnValue(createQueryBuilder({ data: { status: "rejected" }, error: null })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserStatusById({ authId });

    expect(result.status).toBe("rejected");
  });

  it("DB エラー時、status: null とエラーを返す", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue(createQueryBuilder({ data: null, error: dbError })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserStatusById({ authId });

    expect(result.status).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("データが見つからない場合、status: null を返す", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue(createQueryBuilder({ data: null, error: null })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserStatusById({ authId });

    expect(result.status).toBeNull();
  });
});

// ----------------------------------------------------------------
// fetchUserIdByAuthId
// ----------------------------------------------------------------
describe("fetchUserIdByAuthId", () => {
  it("正常時、userId を返す", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue(createQueryBuilder({ data: { id: 42 }, error: null })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserIdByAuthId({ authId });

    expect(result.userId).toBe(42);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、userId: null とエラーを返す", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue(createQueryBuilder({ data: null, error: dbError })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserIdByAuthId({ authId });

    expect(result.userId).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("データが見つからない場合、userId: null を返す", async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue(createQueryBuilder({ data: null, error: null })),
    };
    vi.mocked(createClientSupabaseClient).mockReturnValue(mockClient as never);

    const result = await fetchUserIdByAuthId({ authId });

    expect(result.userId).toBeNull();
  });
});
