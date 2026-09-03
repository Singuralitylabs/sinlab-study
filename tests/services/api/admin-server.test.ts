import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  approveUser,
  changeUserRole,
  fetchManageCounts,
  fetchStudentsProgress,
  fetchUserIdsWithStripeSubscription,
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
  it.each([
    "general",
    "community",
  ] as const)("status=active と選択された会員種別（%s）を同時に更新する", async (membershipType) => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 1 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await approveUser(1, membershipType);

    expect(result.error).toBeNull();
    expect(result.updated).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: membershipType })
    );
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
    // 承認済みユーザーの再承認を原子的に弾く条件（TOCTOU対策）
    expect(builder.neq).toHaveBeenCalledWith("status", "active");
    // updated判定（更新行数）に使うため必須。省略するとPostgRESTがdataを返さず
    // updatedが常にfalseになる
    expect(builder.select).toHaveBeenCalledWith("id");
  });

  it("更新対象が0行（既に承認済み・存在しない等）の場合、updated: false を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await approveUser(1, "community");

    expect(result.error).toBeNull();
    expect(result.updated).toBe(false);
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await approveUser(1, "community");

    expect(result.error).toEqual(dbError);
    expect(result.updated).toBe(false);
  });
});

describe("rejectUser", () => {
  it("status=rejected に更新し、会員種別を NULL に戻す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 3 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await rejectUser(3);

    expect(result.error).toBeNull();
    expect(result.updated).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", membership_type: null })
    );
    expect(builder.eq).toHaveBeenCalledWith("id", 3);
    // service_role はRLSを迂回するため is_deleted=false をクエリ自体に必須で課す
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    // 対象が admin の場合は却下不可（管理者保護をUPDATEに原子的に折り込む。#104）
    expect(builder.neq).toHaveBeenCalledWith("role", "admin");
    expect(builder.select).toHaveBeenCalledWith("id");
  });

  it("対象が admin・存在しない・削除済みのいずれかで0行更新の場合、updated: false を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await rejectUser(3);

    expect(result.error).toBeNull();
    expect(result.updated).toBe(false);
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await rejectUser(3);

    expect(result.error).toEqual(dbError);
    expect(result.updated).toBe(false);
  });
});

describe("changeUserRole", () => {
  it("role を更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 3 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeUserRole(3, "maintainer");

    expect(result.error).toBeNull();
    expect(result.updated).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ role: "maintainer" }));
    expect(builder.eq).toHaveBeenCalledWith("id", 3);
    // service_role はRLSを迂回するため is_deleted=false をクエリ自体に必須で課す
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    // ロール変更は active ユーザーのみ対象（docs/specification.md 2.7）
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
    // 対象が admin の場合はロール変更不可（降格・誤操作防止）
    expect(builder.neq).toHaveBeenCalledWith("role", "admin");
  });

  it("対象が admin・active以外・存在しない・削除済みのいずれかで0行更新の場合、updated: false を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeUserRole(3, "member");

    expect(result.error).toBeNull();
    expect(result.updated).toBe(false);
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeUserRole(3, "member");

    expect(result.error).toEqual(dbError);
    expect(result.updated).toBe(false);
  });
});

// ----------------------------------------------------------------
// fetchUserIdsWithStripeSubscription
// ----------------------------------------------------------------
describe("fetchUserIdsWithStripeSubscription", () => {
  it("契約が無い行をSQL側で除外するクエリを発行し、返された行をそのままIDにマップする", async () => {
    // 終端状態・Checkout手続き中の除外はSQL側（.not）で行うため、モックは絞り込み後の行を返す想定
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: [{ user_id: 1 }, { user_id: 3 }],
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserIdsWithStripeSubscription();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([1, 3]);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.not).toHaveBeenCalledWith(
      "status",
      "in",
      "(canceled,unpaid,incomplete_expired,paused,checkout_pending)"
    );
  });

  it("DBエラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserIdsWithStripeSubscription();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});
