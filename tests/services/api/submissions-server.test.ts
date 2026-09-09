import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchRecentSubmissions,
  fetchSubmissionsByUserId,
  SUBMISSION_CONTENT_COLUMNS,
} from "@/app/services/api/submissions-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchRecentSubmissions
// ----------------------------------------------------------------
describe("fetchRecentSubmissions", () => {
  it("直近の提出と提出総数を1クエリで返す（指定件数で limit）", async () => {
    const rows = [
      {
        id: 1,
        submitted_at: "2026-07-05T00:00:00+00:00",
        user: { display_name: "受講生A" },
        content: { title: "課題1" },
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null, count: 42 },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchRecentSubmissions(5);

    expect(result.data).toEqual(rows);
    expect(result.count).toBe(42);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("DB エラー時、data: null / count: 0 とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError, count: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchRecentSubmissions(5);

    expect(result.data).toBeNull();
    expect(result.count).toBe(0);
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchSubmissionsByUserId
// ----------------------------------------------------------------
describe("fetchSubmissionsByUserId", () => {
  it("content の本文などの重いカラムを取得しないカラム定義で select する", async () => {
    const rows = [
      {
        id: 1,
        user_id: 10,
        content_id: 100,
        content: { id: 100, title: "課題1", content_type: "exercise" },
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: rows, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchSubmissionsByUserId(10);

    expect(result.data).toEqual(rows);
    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.select).toHaveBeenCalledWith(
      `*, content:learning_contents(${SUBMISSION_CONTENT_COLUMNS})`
    );
  });
});
