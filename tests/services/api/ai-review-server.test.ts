import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { fetchAllSubmissionsWithReviews } from "@/app/services/api/ai-review-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchAllSubmissionsWithReviews
// ----------------------------------------------------------------
describe("fetchAllSubmissionsWithReviews", () => {
  it("指定ページの提出一覧と総数を返す（2ページ目は range(20, 39)）", async () => {
    const rows = [{ id: 21 }, { id: 22 }];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null, count: 42 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews({ page: 2, pageSize: 20 });

    expect(result.data).toEqual(rows);
    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(20, 39);
  });

  it("引数省略時は1ページ目を range(0, 19) で取得する", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null, count: 0 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews();

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.range).toHaveBeenCalledWith(0, 19);
  });

  it("DB エラー時、data: null / count: 0 とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError, count: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllSubmissionsWithReviews({ page: 1, pageSize: 20 });

    expect(result.data).toBeNull();
    expect(result.count).toBe(0);
    expect(result.error).toEqual(dbError);
  });
});
