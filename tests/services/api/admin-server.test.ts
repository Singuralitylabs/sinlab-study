import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import {
  approveUser,
  changeMembershipType,
  changeUserRole,
  createContent,
  createPhase,
  createTheme,
  createWeek,
  fetchManageCounts,
  fetchStudentsProgress,
  fetchUserIdsWithStripeSubscription,
  isUserCurrentlySubscribed,
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

  // 集約自体（GROUP BY user_id・count(*)・max(completed_at)、is_completed = true の
  // 絞り込み、NULLの扱い）はRPC定義（マイグレーション）側の責務で、このテストが
  // 検証するのはRPCの返り値をStudentProgressへ正しくマッピングすることのみ。
  it("RPCが返した集計結果をユーザーごとのStudentProgressにマッピングする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: [
          {
            data: [{ user_id: 1, completed_count: 3, last_activity: "2026-07-03T00:00:00+00:00" }],
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

  // last_activity はRPCの生成型上は非nullだが、completed_at がnullableな以上
  // 実際にはnullが返りうる（overrideTypesで型を上書きしている）。ここではRPCが
  // nullを返した場合に、StudentProgress.lastActivityへnullのまま落とすことを保証する。
  it("RPCが last_activity: null を返した場合、そのままnullとしてマッピングする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: [
          { data: [{ user_id: 1, completed_count: 1, last_activity: null }], error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { user: users[0], totalContents: 10, completedContents: 1, lastActivity: null },
      { user: users[1], totalContents: 10, completedContents: 0, lastActivity: null },
    ]);
  });

  it("RPCの返り値が複数ページにまたがる場合、全ページ分を集約する（db-max-rows非依存）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        // サーバーが1回あたり1行しか返さないケース（db-max-rows < pageSize 相当）
        get_students_progress_summary: [
          {
            data: [{ user_id: 1, completed_count: 5, last_activity: "2026-07-01T00:00:00+00:00" }],
            error: null,
          },
          {
            data: [{ user_id: 2, completed_count: 2, last_activity: "2026-07-02T00:00:00+00:00" }],
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
        completedContents: 5,
        lastActivity: "2026-07-01T00:00:00+00:00",
      },
      {
        user: users[1],
        totalContents: 10,
        completedContents: 2,
        lastActivity: "2026-07-02T00:00:00+00:00",
      },
    ]);
    const progressCalls = mockClient.rpc.mock.calls.filter(
      ([fn]) => fn === "get_students_progress_summary"
    );
    expect(progressCalls).toHaveLength(3);
  });

  it("進捗の照会がRPCへの呼び出しに閉じる（ユーザーごとの逐次クエリ = N+1が無い）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: { data: [], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchStudentsProgress();

    const progressCalls = mockClient.rpc.mock.calls.filter(
      ([fn]) => fn === "get_students_progress_summary"
    );
    expect(progressCalls).toHaveLength(1);
  });

  it("進捗取得エラー時は完了数0にフォールバックし、受講生一覧は返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: { data: null, error: dbError },
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
    expect(mockClient.rpc).not.toHaveBeenCalled();
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
  it.each(["general", "community"] as const)(
    "status=active と選択された会員種別（%s）を同時に更新する",
    async (membershipType) => {
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
      // service_role はRLSを迂回するため is_deleted=false をクエリ自体に必須で課す
      expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
      // 承認済みユーザーの再承認を原子的に弾く条件（TOCTOU対策）
      expect(builder.neq).toHaveBeenCalledWith("status", "active");
      // updated判定（更新行数）に使うため必須。省略するとPostgRESTがdataを返さず
      // updatedが常にfalseになる
      expect(builder.select).toHaveBeenCalledWith("id");
    }
  );

  it("更新対象が0行（既に承認済み・存在しない・削除済み等）の場合、updated: false を返す", async () => {
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

describe("changeMembershipType", () => {
  it("active ユーザーの membership_type を更新する（status は書き換えない）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 3 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeMembershipType(3, "general");

    expect(result.error).toBeNull();
    expect(result.updated).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    const updatePayload = builder.update.mock.calls[0][0];
    expect(updatePayload).toEqual(expect.objectContaining({ membership_type: "general" }));
    expect(updatePayload).not.toHaveProperty("status");
    expect(builder.eq).toHaveBeenCalledWith("id", 3);
    // service_role はRLSを迂回するため is_deleted=false をクエリ自体に必須で課す
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    // 対象は active ユーザーのみ（docs/specification.md 2.7）
    expect(builder.eq).toHaveBeenCalledWith("status", "active");
    expect(builder.select).toHaveBeenCalledWith("id");
  });

  it("対象が active以外・存在しない・削除済みのいずれかで0行更新の場合、updated: false を返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeMembershipType(3, "community");

    expect(result.error).toBeNull();
    expect(result.updated).toBe(false);
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await changeMembershipType(3, "community");

    expect(result.error).toEqual(dbError);
    expect(result.updated).toBe(false);
  });
});

describe("isUserCurrentlySubscribed", () => {
  it("終端状態・手続き中でないステータスの行がある場合、契約中と判定する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: { status: "active", cancel_at_period_end: false, current_period_end: null },
          error: null,
        },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await isUserCurrentlySubscribed(5);

    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("user_id", 5);
  });

  it("終端状態（例: canceled）の行しかない場合、契約中ではないと判定する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: {
          data: { status: "canceled", cancel_at_period_end: false, current_period_end: null },
          error: null,
        },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await isUserCurrentlySubscribed(5);

    expect(result.error).toBeNull();
    expect(result.data).toBe(false);
  });

  it("行が存在しない場合、契約中ではないと判定する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await isUserCurrentlySubscribed(5);

    expect(result.error).toBeNull();
    expect(result.data).toBe(false);
  });

  it("DBエラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await isUserCurrentlySubscribed(5);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
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

// ----------------------------------------------------------------
// createTheme / createPhase / createWeek / createContent（挿入位置からの再採番）
// ----------------------------------------------------------------
describe("createTheme", () => {
  it("兄弟が存在しない場合、display_order: 1 で作成する", async () => {
    const createdTheme = { id: 100, name: "新テーマ", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [
          { data: [], error: null },
          { data: createdTheme, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: createdTheme, error: null });
    const insertBuilder = mockClient.from.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "新テーマ", display_order: 1 })
    );
  });

  it("既存兄弟がいる場合、display_orderが変わる行だけUPDATEしてからINSERTする", async () => {
    const createdTheme = { id: 100, name: "新テーマ", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: null, error: null },
          { data: createdTheme, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: createdTheme, error: null });
    const updateBuilder = mockClient.from.mock.results[1].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ display_order: 2 });
    expect(updateBuilder.eq).toHaveBeenCalledWith("id", 5);
    const insertBuilder = mockClient.from.mock.results[2].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ display_order: 1 })
    );
  });

  it("兄弟一覧の取得に失敗した場合、UPDATE・INSERTを行わずエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_themes: { data: null, error: dbError } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: null, error: dbError });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("insertAfterIdが兄弟一覧に存在しない場合、InvalidInsertAfterIdErrorを投げてINSERTしない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: { data: [{ id: 5, display_order: 1 }], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(createTheme({ name: "新テーマ", insertAfterId: 999 })).rejects.toThrow(
      InvalidInsertAfterIdError
    );
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("再採番のUPDATEが失敗した場合、INSERTを行わずエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: null, error: dbError });
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });
});

describe("createPhase", () => {
  it("同じtheme_id配下だけを兄弟として絞り込み、display_orderを決定してから作成する", async () => {
    const createdPhase = { id: 100, theme_id: 1, name: "新フェーズ", display_order: 2 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: createdPhase, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createPhase({
      theme_id: 1,
      name: "新フェーズ",
      insertAfterId: 5,
    });

    expect(result).toEqual({ data: createdPhase, error: null });
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("theme_id", 1);
    const insertBuilder = mockClient.from.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ theme_id: 1, display_order: 2 })
    );
  });

  it("insertAfterIdが別テーマ配下のフェーズを指す場合、InvalidInsertAfterIdErrorを投げる", async () => {
    // 兄弟取得は theme_id=1 で絞り込む前提のため、別テーマのフェーズは結果に含まれない
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_phases: { data: [], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(
      createPhase({ theme_id: 1, name: "新フェーズ", insertAfterId: 999 })
    ).rejects.toThrow(InvalidInsertAfterIdError);
  });
});

describe("createWeek", () => {
  it("同じphase_id配下だけを兄弟として絞り込み、display_orderを決定してから作成する", async () => {
    const createdWeek = { id: 100, phase_id: 1, name: "新週", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_weeks: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: null, error: null },
          { data: createdWeek, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createWeek({ phase_id: 1, name: "新週", insertAfterId: null });

    expect(result).toEqual({ data: createdWeek, error: null });
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("phase_id", 1);
    const updateBuilder = mockClient.from.mock.results[1].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ display_order: 2 });
  });
});

describe("createContent", () => {
  it("createAdminSupabaseClientを使い、同じweek_id配下だけを兄弟として絞り込む", async () => {
    const createdContent = { id: 100, week_id: 1, title: "新コンテンツ", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: [], error: null },
          { data: createdContent, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createContent({
      week_id: 1,
      title: "新コンテンツ",
      content_type: "video",
      insertAfterId: null,
    });

    expect(result).toEqual({ data: createdContent, error: null });
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("week_id", 1);
    const insertBuilder = mockClient.from.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ week_id: 1, title: "新コンテンツ", display_order: 1 })
    );
  });

  it("insertAfterIdが削除済みコンテンツを指す場合、InvalidInsertAfterIdErrorを投げる", async () => {
    // 兄弟取得は is_deleted=false で絞り込む前提のため、削除済みコンテンツは結果に含まれない
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_contents: { data: [{ id: 1, display_order: 1 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(
      createContent({
        week_id: 1,
        title: "新コンテンツ",
        content_type: "video",
        insertAfterId: 999,
      })
    ).rejects.toThrow(InvalidInsertAfterIdError);
  });
});
