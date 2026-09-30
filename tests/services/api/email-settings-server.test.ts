import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchEmailLogs,
  fetchEmailSettings,
  fetchEmailSettingsForAdmin,
  fetchTodayPromotionalCount,
  isTransactionalEmailEnabled,
  updateDigestDailyLimit,
  updateEmailKindSettings,
} from "@/app/services/api/email-settings-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const kindRow = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  enabled: true,
  send_days: null,
  send_weekday: null,
  updated_at: "2026-10-01T00:00:00Z",
  updated_by: null,
  ...extra,
});

const allKindRows = [
  kindRow("signup"),
  kindRow("approved"),
  kindRow("upgraded"),
  kindRow("cancel_scheduled"),
  kindRow("subscription_ended"),
  kindRow("weekly_digest", { send_weekday: 1 }),
  kindRow("inactivity_reminder", { send_days: [14, 7], updated_by: 5 }),
  kindRow("trial_nurture", { send_days: [2, 5, 7, 14] }),
  kindRow("announcement"),
];
const settingsRow = { digest_daily_limit: 80, updated_at: "2026-10-01T00:00:00Z", updated_by: 5 };

const dbError = { message: "db error" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchEmailSettings", () => {
  it("種別ごとの設定と1日の上限を返す（send_days は昇順）", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        email_kind_settings: { data: allKindRows, error: null },
        email_settings: { data: settingsRow, error: null },
      },
    });

    const settings = await fetchEmailSettings(client as never);

    expect(settings.digestDailyLimit).toBe(80);
    expect(settings.kinds.inactivity_reminder.sendDays).toEqual([7, 14]);
    expect(settings.kinds.weekly_digest.sendWeekday).toBe(1);
    expect(settings.kinds.signup.enabled).toBe(true);
  });

  it.each([
    ["種別の取得がエラー", { email_kind_settings: { data: null, error: dbError } }, "db error"],
    ["上限の取得がエラー", { email_settings: { data: null, error: dbError } }, "db error"],
    ["上限の行が無い", { email_settings: { data: null, error: null } }, "email_settings"],
    [
      "種別の行が欠けている",
      { email_kind_settings: { data: allKindRows.slice(1), error: null } },
      "signup",
    ],
  ])(
    "読めないとき（%s）は throw する（呼び出し側がフェイルクローズする）",
    async (_l, override, message) => {
      const client = createMockSupabaseClient({
        tableResults: {
          email_kind_settings: { data: allKindRows, error: null },
          email_settings: { data: settingsRow, error: null },
          ...override,
        },
      });

      await expect(fetchEmailSettings(client as never)).rejects.toThrow(message);
    }
  );

  it.each([
    ["digest_daily_limit が範囲外", { ...settingsRow, digest_daily_limit: 200 }],
    ["digest_daily_limit が 0", { ...settingsRow, digest_daily_limit: 0 }],
  ])("値が不正（%s）なら throw する", async (_l, row) => {
    const client = createMockSupabaseClient({
      tableResults: {
        email_kind_settings: { data: allKindRows, error: null },
        email_settings: { data: row, error: null },
      },
    });

    await expect(fetchEmailSettings(client as never)).rejects.toThrow();
  });

  it("send_days が範囲外・重複・空の行は throw する", async () => {
    for (const sendDays of [[0, 3], [61], [3, 3], []]) {
      const rows = allKindRows.map((row) =>
        row.kind === "trial_nurture" ? { ...row, send_days: sendDays } : row
      );
      const client = createMockSupabaseClient({
        tableResults: {
          email_kind_settings: { data: rows, error: null },
          email_settings: { data: settingsRow, error: null },
        },
      });

      await expect(fetchEmailSettings(client as never)).rejects.toThrow("send_days");
    }
  });
});

describe("isTransactionalEmailEnabled", () => {
  const clientWith = (result: { data: unknown; error: unknown }) => {
    const client = createMockSupabaseClient({ tableResults: { email_kind_settings: result } });
    return client;
  };

  it("enabled = false のときだけ false", async () => {
    expect(
      await isTransactionalEmailEnabled(
        clientWith({ data: { enabled: false }, error: null }) as never,
        "approved"
      )
    ).toBe(false);
    expect(
      await isTransactionalEmailEnabled(
        clientWith({ data: { enabled: true }, error: null }) as never,
        "approved"
      )
    ).toBe(true);
  });

  it.each([
    ["DB エラー", { data: null, error: dbError }],
    ["行が無い", { data: null, error: null }],
  ])("読めない（%s）ときは true（登録・決済の通知を欠落させない）", async (_l, result) => {
    expect(await isTransactionalEmailEnabled(clientWith(result) as never, "signup")).toBe(true);
  });

  it("例外が出ても true", async () => {
    const client = { from: vi.fn(() => Promise.reject(new Error("boom"))) };

    expect(await isTransactionalEmailEnabled(client as never, "signup")).toBe(true);
  });
});

describe("updateEmailKindSettings / updateDigestDailyLimit", () => {
  const current = { enabled: true, send_days: [2, 5], send_weekday: null };
  const serverClient = (
    kindResults: { data: unknown; error: unknown }[],
    settingsResult: { data: unknown; error: unknown } = { data: [], error: null }
  ) => {
    const client = createMockSupabaseClient({
      tableResults: { email_kind_settings: kindResults, email_settings: settingsResult },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    return client;
  };

  it("管理者のセッション（RLS適用のクライアント）で更新し、更新者と更新日時を記録する", async () => {
    const client = serverClient([
      { data: current, error: null },
      { data: [{ kind: "signup" }], error: null },
    ]);

    const result = await updateEmailKindSettings("signup", { enabled: false }, 9);

    expect(result).toEqual({ error: null, updated: true });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    const builder = client.from.mock.results[1].value;
    expect(builder.update).toHaveBeenCalledWith({
      enabled: false,
      updated_at: expect.any(String),
      updated_by: 9,
    });
    expect(builder.eq).toHaveBeenCalledWith("kind", "signup");
  });

  it("値を変えない保存では updated_at を更新しない（送信日の障害検知を隠さない）", async () => {
    const client = serverClient([{ data: current, error: null }]);

    const result = await updateEmailKindSettings(
      "trial_nurture",
      { enabled: true, send_days: [5, 2].sort((a, b) => a - b) },
      9
    );

    expect(result).toEqual({ error: null, updated: true });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("send_days が変わるなら更新する", async () => {
    const client = serverClient([
      { data: current, error: null },
      { data: [{ kind: "trial_nurture" }], error: null },
    ]);

    await updateEmailKindSettings("trial_nurture", { send_days: [2, 5, 7] }, 9);

    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("0行（RLSで拒否・行が無い）は updated: false、DBエラーは error を返す", async () => {
    serverClient([
      { data: null, error: null },
      { data: [], error: null },
    ]);
    expect(await updateEmailKindSettings("signup", { enabled: false }, 9)).toEqual({
      error: null,
      updated: false,
    });

    serverClient([
      { data: current, error: null },
      { data: null, error: dbError },
    ]);
    expect(await updateEmailKindSettings("signup", { enabled: false }, 9)).toEqual({
      error: dbError,
      updated: false,
    });

    serverClient([{ data: null, error: dbError }]);
    expect(await updateEmailKindSettings("signup", { enabled: false }, 9)).toEqual({
      error: dbError,
      updated: false,
    });

    serverClient([], { data: null, error: dbError });
    expect(await updateDigestDailyLimit(50, 9)).toEqual({ error: dbError, updated: false });
  });

  it("1日の上限は id = 1 の行を更新する", async () => {
    const client = serverClient([], { data: [{ id: 1 }], error: null });

    expect(await updateDigestDailyLimit(50, 9)).toEqual({ error: null, updated: true });
    const builder = client.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({
      digest_daily_limit: 50,
      updated_at: expect.any(String),
      updated_by: 9,
    });
    expect(builder.eq).toHaveBeenCalledWith("id", 1);
  });
});

describe("fetchEmailSettingsForAdmin", () => {
  it("更新者の表示名を付けて返す", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        email_kind_settings: { data: allKindRows, error: null },
        email_settings: { data: settingsRow, error: null },
        users: { data: [{ id: 5, display_name: "管理者A" }], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const { data, error } = await fetchEmailSettingsForAdmin();

    expect(error).toBeNull();
    expect(data?.editorNames).toEqual({ 5: "管理者A" });
  });

  it("読めなければエラーメッセージを返す", async () => {
    const client = createMockSupabaseClient({
      tableResults: { email_kind_settings: { data: null, error: dbError } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    expect(await fetchEmailSettingsForAdmin()).toEqual({
      data: null,
      error: "メール設定の取得に失敗しました",
    });
  });
});

describe("fetchEmailLogs", () => {
  const logRow = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    created_at: "2026-10-05T00:00:00Z",
    kind: "weekly_digest",
    reference_key: "2026-10-05",
    sent_at: null,
    error: null,
    user: { display_name: "山田", email: "y@example.com" },
    ...extra,
  });

  const adminClient = (data: unknown, error: unknown = null) => {
    const client = createMockSupabaseClient({ tableResults: { email_logs: { data, error } } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
    return client.from.mock.results;
  };

  it("繰り越し予約の行を除き、種別・状態で絞り、新しい順に並べ、本文・メッセージIDを選ばない", async () => {
    const client = createMockSupabaseClient({
      tableResults: { email_logs: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    await fetchEmailLogs({ kind: "announcement", status: "failed" });

    const builder = client.from.mock.results[0].value;
    expect(builder.neq).toHaveBeenCalledWith("kind", "weekly_digest_reserved");
    expect(builder.eq).toHaveBeenCalledWith("kind", "announcement");
    expect(builder.is).toHaveBeenCalledWith("sent_at", null);
    expect(builder.not).toHaveBeenCalledWith("error", "is", null);
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    const selected = builder.select.mock.calls[0][0] as string;
    expect(selected).not.toContain("provider_message_id");
    expect(selected).not.toContain("body");
  });

  it.each([
    ["sent", "not", ["sent_at", "is", null]],
    ["pending", "is", ["error", null]],
  ] as const)("状態 %s の条件", async (status, method, args) => {
    const client = createMockSupabaseClient({
      tableResults: { email_logs: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    await fetchEmailLogs({ status });

    const builder = client.from.mock.results[0].value;
    expect(builder[method]).toHaveBeenCalledWith(...args);
  });

  it("状態（送信済み・失敗・未完了）を行から判定する", async () => {
    adminClient([
      logRow(1, { sent_at: "2026-10-05T00:00:01Z" }),
      logRow(2, { error: "status=500" }),
      logRow(3),
    ]);

    const { data } = await fetchEmailLogs();

    expect(data?.map((row) => row.status)).toEqual(["sent", "failed", "pending"]);
  });

  it("ページングは1件多く取って次のページの有無を判定する", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => logRow(i + 1));
    const client = createMockSupabaseClient({
      tableResults: { email_logs: { data: rows, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const { data, hasNext } = await fetchEmailLogs({ page: 3 });

    expect(data).toHaveLength(50);
    expect(hasNext).toBe(true);
    expect(client.from.mock.results[0].value.range).toHaveBeenCalledWith(100, 150);
  });

  it("DBエラーならエラーメッセージを返す", async () => {
    adminClient(null, dbError);

    expect(await fetchEmailLogs()).toEqual({
      data: null,
      hasNext: false,
      error: "送信履歴の取得に失敗しました",
    });
  });
});

describe("fetchTodayPromotionalCount", () => {
  it("今日（JST）の案内系メールの件数を返す", async () => {
    const client = createMockSupabaseClient({
      tableResults: { email_logs: { data: null, error: null, count: 12 } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const result = await fetchTodayPromotionalCount(new Date("2026-10-04T23:00:00Z"));

    expect(result).toEqual({ count: 12, error: null });
    const builder = client.from.mock.results[0].value;
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-10-04T15:00:00.000Z");
    expect(builder.in).toHaveBeenCalledWith("kind", expect.arrayContaining(["weekly_digest"]));
    expect(builder.in.mock.calls[0][1]).not.toContain("signup");
  });
});
