import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  approveUser,
  fetchManageCounts,
  fetchStudentsProgress,
  rejectUser,
} from "@/app/services/api/admin-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchStudentsProgress
// ----------------------------------------------------------------
describe("fetchStudentsProgress", () => {
  const users = [
    { id: 1, display_name: "受講生A", email: "a@example.com" },
    { id: 2, display_name: "受講生B", email: "b@example.com" },
  ];

  it("完了済み進捗をユーザー単位に集約して返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
        // 1回目: 進捗3行 → 2回目: 空ページでページング終了
        user_progress: [
          {
            data: [
              { user_id: 1, completed_at: "2026-07-01T00:00:00+00:00" },
              { user_id: 1, completed_at: "2026-07-03T00:00:00+00:00" },
              { user_id: 1, completed_at: "2026-07-02T00:00:00+00:00" },
            ],
            error: null,
          },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        user: users[0],
        totalContents: 10,
        completedContents: 3,
        lastActivity: "2026-07-03T00:00:00+00:00",
      },
      { user: users[1], totalContents: 10, completedContents: 0, lastActivity: null },
    ]);
  });

  it("進捗が複数ページにまたがる場合、全ページ分を集約する（max-rows 非依存）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
        // サーバーが1回あたり2行しか返さないケース（max-rows < pageSize 相当）
        user_progress: [
          {
            data: [
              { user_id: 1, completed_at: "2026-07-01T00:00:00+00:00" },
              { user_id: 2, completed_at: "2026-07-02T00:00:00+00:00" },
            ],
            error: null,
          },
          { data: [{ user_id: 1, completed_at: "2026-07-04T00:00:00+00:00" }], error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        user: users[0],
        totalContents: 10,
        completedContents: 2,
        lastActivity: "2026-07-04T00:00:00+00:00",
      },
      {
        user: users[1],
        totalContents: 10,
        completedContents: 1,
        lastActivity: "2026-07-02T00:00:00+00:00",
      },
    ]);
  });

  it("user_progress への照会回数はユーザー数に依存しない（N+1の解消）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
        user_progress: { data: [], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchStudentsProgress();

    const progressCalls = mockClient.from.mock.calls.filter(([table]) => table === "user_progress");
    expect(progressCalls).toHaveLength(1);
  });

  it("進捗取得エラー時は完了数0にフォールバックし、受講生一覧は返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
        user_progress: { data: null, error: dbError },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { user: users[0], totalContents: 10, completedContents: 0, lastActivity: null },
      { user: users[1], totalContents: 10, completedContents: 0, lastActivity: null },
    ]);
  });

  it("ユーザーが0人の場合、進捗を照会せず空配列を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: [], error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    const progressCalls = mockClient.from.mock.calls.filter(([table]) => table === "user_progress");
    expect(progressCalls).toHaveLength(0);
  });

  it("ユーザー一覧取得エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: null, error: dbError },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchManageCounts
// ----------------------------------------------------------------
describe("fetchManageCounts", () => {
  it("各テーブルの件数を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: { data: null, error: null, count: 2 },
        learning_phases: { data: null, error: null, count: 3 },
        learning_weeks: { data: null, error: null, count: 4 },
        learning_contents: { data: null, error: null, count: 5 },
        users: { data: null, error: null, count: 6 },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchManageCounts();

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ themes: 2, phases: 3, weeks: 4, contents: 5, students: 6 });
  });

  it("一部の件数取得に失敗した場合、失敗分は0としてエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: { data: null, error: null, count: 2 },
        learning_phases: { data: null, error: dbError, count: null },
        learning_weeks: { data: null, error: null, count: 4 },
        learning_contents: { data: null, error: null, count: 5 },
        users: { data: null, error: null, count: 6 },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchManageCounts();

    expect(result.error).toEqual(dbError);
    expect(result.data).toEqual({ themes: 2, phases: 0, weeks: 4, contents: 5, students: 6 });
  });
});

// ----------------------------------------------------------------
// approveUser / rejectUser
// ----------------------------------------------------------------
describe("approveUser", () => {
  it("status=active と選択された会員種別を同時に更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await approveUser(1, "general");

    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "general" })
    );
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
  });

  it("コミュニティ会員として承認できる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await approveUser(2, "community");

    expect(mockClient.from.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "community" })
    );
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await approveUser(1, "community");

    expect(result.error).toEqual(dbError);
  });
});

describe("rejectUser", () => {
  it("status=rejected に更新し、会員種別を NULL に戻す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await rejectUser(3);

    expect(result.error).toBeNull();
    expect(mockClient.from.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", membership_type: null })
    );
  });
});
