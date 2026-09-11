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
  fetchAllContents,
  fetchManageCounts,
  fetchStudentsProgress,
  fetchUserIdsWithStripeSubscription,
  isUserCurrentlySubscribed,
  parseStrictFilterId,
  rejectUser,
  updateContent,
  updatePhase,
  updateTheme,
  updateWeek,
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
        // user 2 は進捗0でRPCに出ないため、users未充足 → 空ページで打ち切る
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
    // pageSize=1000 満杯のときだけ次ページを取りに行く（#196）。
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      user_id: i + 1,
      completed_count: 1,
      last_activity: null as string | null,
    }));
    page1[0] = {
      user_id: 1,
      completed_count: 5,
      last_activity: "2026-07-01T00:00:00+00:00",
    };
    const page2 = [
      {
        user_id: 2,
        completed_count: 2,
        last_activity: "2026-07-02T00:00:00+00:00",
      },
    ];
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: [
          { data: page1, error: null },
          { data: page2, error: null },
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
    expect(progressCalls).toHaveLength(2);
  });

  it("activeユーザー全員分の進捗が短ページに収まる場合、空ページを取りに行かない（#196）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: {
          data: [
            { user_id: 1, completed_count: 3, last_activity: "2026-07-03T00:00:00+00:00" },
            { user_id: 2, completed_count: 1, last_activity: null },
          ],
          error: null,
        },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchStudentsProgress();

    const progressCalls = mockClient.rpc.mock.calls.filter(
      ([fn]) => fn === "get_students_progress_summary"
    );
    expect(progressCalls).toHaveLength(1);
  });

  it("db-max-rows相当の短ページでも未充足なら続行し、取りこぼさない", async () => {
    // pageSize=1000 だがサーバーが500行しか返さないケースを、users未充足で再現する
    const mockClient = createMockSupabaseClient({
      tableResults: {
        users: { data: users, error: null },
        learning_contents: { data: null, error: null, count: 10 },
      },
      rpcResults: {
        get_students_progress_summary: [
          {
            data: [{ user_id: 1, completed_count: 5, last_activity: "2026-07-01T00:00:00+00:00" }],
            error: null,
          },
          {
            data: [{ user_id: 2, completed_count: 2, last_activity: "2026-07-02T00:00:00+00:00" }],
            error: null,
          },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStudentsProgress();

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
    expect(progressCalls).toHaveLength(2);
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

// ----------------------------------------------------------------
// parseStrictFilterId / fetchAllContents の不正フィルタ
// ----------------------------------------------------------------
describe("parseStrictFilterId", () => {
  it("整数文字列のみを受け入れる", () => {
    expect(parseStrictFilterId("12")).toBe(12);
    expect(parseStrictFilterId(undefined)).toBeUndefined();
    expect(parseStrictFilterId("")).toBeUndefined();
    expect(parseStrictFilterId("abc")).toBeUndefined();
    expect(parseStrictFilterId("01")).toBeUndefined();
    expect(parseStrictFilterId("2.0")).toBeUndefined();
  });
});

describe("fetchAllContents（不正なフィルタID）", () => {
  it("整数として不正な weekId ではクエリを発行せず空配列を返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchAllContents({ weekId: "abc" });

    expect(result).toEqual({ data: [], error: null });
    expect(mockClient.from).not.toHaveBeenCalled();
  });
});

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

  it("既存兄弟がいる場合、display_orderが変わる行だけ一括RPCでUPDATEしてからINSERTする", async () => {
    const createdTheme = { id: 100, name: "新テーマ", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: createdTheme, error: null },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: createdTheme, error: null });
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_themes",
      p_updates: [{ id: 5, display_order: 2 }],
    });
    const insertBuilder = mockClient.from.mock.results[1].value;
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
    // 999がmock dataに含まれていないだけでなく、is_deleted=falseの絞り込み自体が
    // 実際にクエリへ付与されていることも検証する（絞り込みが消える回帰の検出用）
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
  });

  it("再採番の UPDATE（RPC）が失敗した場合、INSERTを行わずエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [{ data: [{ id: 5, display_order: 1 }], error: null }],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: dbError },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createTheme({ name: "新テーマ", insertAfterId: null });

    expect(result).toEqual({ data: null, error: dbError });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);
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
    // 兄弟取得は theme_id=1 で絞り込む前提のため、別テーマのフェーズは結果に含まれない。
    // mock dataに999を含めていないだけでは絞り込み自体の検証にならないため、
    // theme_id・is_deletedの絞り込みが実際にクエリへ付与されていることも検証する
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_phases: { data: [], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(
      createPhase({ theme_id: 1, name: "新フェーズ", insertAfterId: 999 })
    ).rejects.toThrow(InvalidInsertAfterIdError);

    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("theme_id", 1);
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
  });
});

describe("createWeek", () => {
  it("同じphase_id配下だけを兄弟として絞り込み、display_orderを決定してから作成する", async () => {
    const createdWeek = { id: 100, phase_id: 1, name: "新週", display_order: 1 };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_weeks: [
          { data: [{ id: 5, display_order: 1 }], error: null },
          { data: createdWeek, error: null },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await createWeek({ phase_id: 1, name: "新週", insertAfterId: null });

    expect(result).toEqual({ data: createdWeek, error: null });
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("phase_id", 1);
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_weeks",
      p_updates: [{ id: 5, display_order: 2 }],
    });
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
    // モックのクエリビルダーは .eq() の引数に関わらず設定した data をそのまま返すため、
    // 「999が結果に無い」だけでは is_deleted=false によって除外されたことの検証にならない
    // （絞り込み自体を削除する回帰があっても、999をmock dataに含めていない限りこのテストは
    // 通ってしまう）。そのため兄弟取得クエリに is_deleted=false が実際に付与されていることも
    // 明示的に検証する
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

    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
  });
});

// ----------------------------------------------------------------
// updateTheme / updatePhase / updateWeek / updateContent（編集時の再採番。issue #189）
// ----------------------------------------------------------------
describe("updateTheme（編集時の再採番）", () => {
  it("insertAfterIdを省略した場合、兄弟取得も再採番も行わず、そのまま更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_themes: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updateTheme(1, { name: "更新後" });

    expect(result).toEqual({ error: null });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    const updateBuilder = mockClient.from.mock.results[0].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ name: "更新後" });
  });

  it("insertAfterIdに自分自身のIDを指定した場合、InvalidInsertAfterIdErrorを投げる（自分自身は兄弟一覧から除外されるため）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: { data: [{ id: 2, display_order: 1 }], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(updateTheme(1, { name: "更新後", insertAfterId: 1 })).rejects.toThrow(
      InvalidInsertAfterIdError
    );
    const siblingsBuilder = mockClient.from.mock.results[0].value;
    expect(siblingsBuilder.neq).toHaveBeenCalledWith("id", 1);
  });

  it("insertAfterIdを指定した場合、自分自身を除いた兄弟のうち変化する行だけ一括RPCで再採番してから更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_themes: [
          {
            data: [
              { id: 2, display_order: 1 },
              { id: 3, display_order: 2 },
            ],
            error: null,
          },
          { data: null, error: null },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    // id=2の直後に挿入 → id=3だけ display_order が2→3にずれ、自分自身は2になる
    const result = await updateTheme(1, { name: "更新後", insertAfterId: 2 });

    expect(result).toEqual({ error: null });
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_themes",
      p_updates: [{ id: 3, display_order: 3 }],
    });
    const bodyUpdateBuilder = mockClient.from.mock.results[1].value;
    expect(bodyUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "更新後", display_order: 2 })
    );
  });
});

describe("updatePhase（編集時の再採番）", () => {
  it("insertAfterIdもtheme_idも省略した場合、現在値取得も再採番も行わずそのまま更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_phases: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updatePhase(10, { name: "名称変更のみ" });

    expect(result).toEqual({ error: null });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    const updateBuilder = mockClient.from.mock.results[0].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ name: "名称変更のみ" });
  });

  it("theme_idが変わらない場合、移動先（同じtheme_id配下・自分自身を除く）だけを先頭へ一括RPCで再採番する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: { theme_id: 1 }, error: null },
          {
            data: [
              { id: 2, display_order: 1 },
              { id: 3, display_order: 2 },
            ],
            error: null,
          },
          { data: null, error: null },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updatePhase(10, { theme_id: 1, insertAfterId: null });

    expect(result).toEqual({ error: null });
    const currentFetchBuilder = mockClient.from.mock.results[0].value;
    expect(currentFetchBuilder.select).toHaveBeenCalledWith("theme_id");
    expect(currentFetchBuilder.eq).toHaveBeenCalledWith("id", 10);
    expect(currentFetchBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
    const siblingsBuilder = mockClient.from.mock.results[1].value;
    expect(siblingsBuilder.eq).toHaveBeenCalledWith("theme_id", 1);
    expect(siblingsBuilder.neq).toHaveBeenCalledWith("id", 10);
    // 先頭挿入のため既存の2件とも display_order が1つずつ後ろへずれる（1 RPC）
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_phases",
      p_updates: [
        { id: 2, display_order: 2 },
        { id: 3, display_order: 3 },
      ],
    });
    const bodyUpdateBuilder = mockClient.from.mock.results[2].value;
    expect(bodyUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ theme_id: 1, display_order: 1 })
    );
  });

  it("theme_idを変更した場合、移動先の末尾に追加し（insertAfterId省略時）、本体UPDATE成功後に移動元に残った兄弟の欠番も再採番する", async () => {
    // 呼び出し順は 現在値取得 → 移動先兄弟取得 → 本体UPDATE → 移動元兄弟取得 → 移動元一括RPC。
    // 本体UPDATEを移動元の詰め直しより先に行うことで、途中失敗時に移動元の兄弟同士の
    // 表示順が入れ替わらないようにする（詳細は resequenceDestinationForUpdate のコメント参照）
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: { theme_id: 1 }, error: null },
          { data: [{ id: 20, display_order: 1 }], error: null },
          { data: null, error: null },
          {
            data: [
              { id: 2, display_order: 1 },
              { id: 3, display_order: 3 },
            ],
            error: null,
          },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updatePhase(10, { theme_id: 2 });

    expect(result).toEqual({ error: null });
    const destinationSiblingsBuilder = mockClient.from.mock.results[1].value;
    expect(destinationSiblingsBuilder.eq).toHaveBeenCalledWith("theme_id", 2);
    // 移動先の唯一の兄弟(id=20)は既に末尾なので display_order は変化せず、UPDATEは発生しない
    const bodyUpdateBuilder = mockClient.from.mock.results[2].value;
    expect(bodyUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ theme_id: 2, display_order: 2 })
    );
    const sourceSiblingsBuilder = mockClient.from.mock.results[3].value;
    expect(sourceSiblingsBuilder.eq).toHaveBeenCalledWith("theme_id", 1);
    expect(sourceSiblingsBuilder.neq).toHaveBeenCalledWith("id", 10);
    // 移動元に残ったid=3は欠番(order=3)を詰めて2になる（1 RPC）
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_phases",
      p_updates: [{ id: 3, display_order: 2 }],
    });
  });

  it("親変更時に本体UPDATEが失敗した場合、移動元の再採番は行わずエラーを返す（本体UPDATEを先に行うことで、失敗時に移動元の兄弟同士の表示順を壊さない）", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: { theme_id: 1 }, error: null },
          { data: [{ id: 20, display_order: 1 }], error: null },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updatePhase(10, { theme_id: 2 });

    expect(result).toEqual({ error: dbError });
    // 現在値取得・移動先兄弟取得・本体UPDATEの3回のみで、移動元の再採番には到達しない
    expect(mockClient.from).toHaveBeenCalledTimes(3);
  });

  it("insertAfterIdが別テーマ配下のフェーズを指す場合、InvalidInsertAfterIdErrorを投げる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: { theme_id: 1 }, error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(updatePhase(10, { theme_id: 1, insertAfterId: 999 })).rejects.toThrow(
      InvalidInsertAfterIdError
    );
  });

  it("insertAfterIdに自分自身のIDを指定した場合、InvalidInsertAfterIdErrorを投げる", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_phases: [
          { data: { theme_id: 1 }, error: null },
          { data: [{ id: 2, display_order: 1 }], error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(updatePhase(10, { theme_id: 1, insertAfterId: 10 })).rejects.toThrow(
      InvalidInsertAfterIdError
    );
  });
});

describe("updateWeek（編集時の再採番）", () => {
  it("phase_idが変わらず、insertAfterIdも省略した場合、現在値取得も再採番も行わない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_weeks: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updateWeek(10, { name: "名称変更のみ" });

    expect(result).toEqual({ error: null });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("phase_idを変更した場合、移動先(phase_id)配下を対象に再採番してから本体UPDATEし、成功後に移動元(phase_id)配下も再採番する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_weeks: [
          { data: { phase_id: 1 }, error: null },
          { data: [], error: null },
          { data: null, error: null },
          {
            data: [
              { id: 2, display_order: 1 },
              { id: 3, display_order: 3 },
            ],
            error: null,
          },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updateWeek(10, { phase_id: 2 });

    expect(result).toEqual({ error: null });
    const destinationSiblingsBuilder = mockClient.from.mock.results[1].value;
    expect(destinationSiblingsBuilder.eq).toHaveBeenCalledWith("phase_id", 2);
    const bodyUpdateBuilder = mockClient.from.mock.results[2].value;
    expect(bodyUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ phase_id: 2, display_order: 1 })
    );
    const sourceSiblingsBuilder = mockClient.from.mock.results[3].value;
    expect(sourceSiblingsBuilder.eq).toHaveBeenCalledWith("phase_id", 1);
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_weeks",
      p_updates: [{ id: 3, display_order: 2 }],
    });
  });
});

describe("updateContent（編集時の再採番）", () => {
  it("createAdminSupabaseClientを使い、week_idが変わらずinsertAfterIdも省略した場合は再採番しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { learning_contents: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updateContent(10, { title: "タイトル変更のみ" });

    expect(result).toEqual({ error: null });
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("week_idを変更した場合、移動先の兄弟一覧を再採番してから本体UPDATEし、成功後に移動元の欠番も詰め直す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: { week_id: 1 }, error: null },
          { data: [{ id: 20, display_order: 1 }], error: null },
          { data: null, error: null },
          { data: [{ id: 3, display_order: 3 }], error: null },
        ],
      },
      rpcResults: {
        bulk_update_sibling_display_order: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await updateContent(10, { week_id: 2 });

    expect(result).toEqual({ error: null });
    const destinationSiblingsBuilder = mockClient.from.mock.results[1].value;
    expect(destinationSiblingsBuilder.eq).toHaveBeenCalledWith("week_id", 2);
    const bodyUpdateBuilder = mockClient.from.mock.results[2].value;
    expect(bodyUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ week_id: 2, display_order: 2 })
    );
    const sourceSiblingsBuilder = mockClient.from.mock.results[3].value;
    expect(sourceSiblingsBuilder.eq).toHaveBeenCalledWith("week_id", 1);
    // 移動元に残ったid=3は欠番(order=3)を詰めて1になる（1 RPC）
    expect(mockClient.rpc).toHaveBeenCalledWith("bulk_update_sibling_display_order", {
      p_table: "learning_contents",
      p_updates: [{ id: 3, display_order: 1 }],
    });
  });
});
