import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchRecentSubmissions,
  fetchSubmissionsCount,
} from "@/app/services/api/submissions-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchSubmissionsCount
// ----------------------------------------------------------------
describe("fetchSubmissionsCount", () => {
  it("提出物の総数を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null, count: 42 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsCount();

    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、count: 0 とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError, count: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsCount();

    expect(result.count).toBe(0);
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchRecentSubmissions
// ----------------------------------------------------------------
describe("fetchRecentSubmissions", () => {
  it("指定件数で limit を掛けて直近の提出を返す", async () => {
    const rows = [
      {
        id: 1,
        submitted_at: "2026-07-05T00:00:00+00:00",
        user: { display_name: "受講生A" },
        content: { title: "課題1" },
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchRecentSubmissions(5);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchRecentSubmissions(5);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});
