import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/notifications/email")>()),
  sendEmail: vi.fn(),
}));

import {
  ANNOUNCEMENT_EMAIL_RETRY_DAYS,
  EMAIL_DIGEST_MAX_PER_DAY,
  EMAIL_DIGEST_SEND_INTERVAL_MS,
  INACTIVITY_REMINDER_DAYS,
  TRIAL_NURTURE_DAYS,
} from "@/app/constants/notifications";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { sendEmail } from "@/app/services/notifications/email";
import { runEmailDigest } from "@/app/services/notifications/email-digest-server";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * Minimal fake of the service_role client. Holds tables as arrays and actually applies eq / in / is
 * / gte / lt / range (dotted filters like nested select's `phases.xxx` are ignored and the prepared
 * tree is returned as is). INSERT into email_logs reproduces UNIQUE (user_id, kind, reference_key)
 * and returns 23505 on violation.
 */
function createFakeDb(tables: Record<string, Row[]>, options: { maxRows?: number } = {}) {
  const db: Record<string, Row[]> = { email_logs: [], ...tables };
  let nextId = 1;
  /** created_at (DB now()) of inserted rows; runDigest() aligns it with the run time. */
  const clock = { now: new Date() };
  /** Adding `<table>:<op>` makes that operation a DB error. */
  const failures = new Set<string>();
  /**
   * Decides per INSERT whether to fail with a DB error (to fail the claim of one specific recipient
   * only).
   */
  const insertFailures: { when: ((table: string, value: Row) => boolean) | null } = { when: null };

  function from(table: string) {
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row = {};
    let upsertRows: Row[] = [];
    const filters: Filter[] = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;
    const orders: { column: string; ascending: boolean }[] = [];

    const isDuplicate = (rows: Row[], value: Row) =>
      (table === "email_logs" &&
        rows.some(
          (row) =>
            row.user_id === value.user_id &&
            row.kind === value.kind &&
            row.reference_key === value.reference_key
        )) ||
      (table === "cron_locks" && rows.some((row) => row.name === value.name));

    const execute = (): { data: unknown; error: unknown } => {
      if (failures.has(`${table}:${op}`)) {
        return { data: null, error: { code: "XX000", message: "db down" } };
      }
      const rows = db[table] ?? [];
      db[table] = rows;
      if (op === "upsert") {
        for (const value of upsertRows) {
          if (!isDuplicate(rows, value)) {
            rows.push({ id: nextId++, created_at: clock.now.toISOString(), ...value });
          }
        }
        return { data: null, error: null };
      }
      if (op === "insert") {
        if (insertFailures.when?.(table, payload)) {
          return { data: null, error: { code: "08006", message: "connection failure" } };
        }
        if (isDuplicate(rows, payload)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const inserted = {
          id: nextId++,
          sent_at: null,
          error: null,
          created_at: clock.now.toISOString(),
          ...payload,
        };
        rows.push(inserted);
        db[table] = rows;
        return { data: [inserted], error: null };
      }
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (op === "update") {
        for (const row of matched) {
          Object.assign(row, payload);
        }
        return { data: matched, error: null };
      }
      if (op === "delete") {
        db[table] = rows.filter((row) => !matched.includes(row));
        return { data: null, error: null };
      }
      const sorted = [...matched].sort((a, b) => {
        for (const { column, ascending } of orders) {
          const x = a[column] as string | number | null | undefined;
          const y = b[column] as string | number | null | undefined;
          if (x === y) continue;
          if (x == null) return 1;
          if (y == null) return -1;
          return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      let result = range ? sorted.slice(range[0], range[1] + 1) : sorted;
      if (limit !== null) result = result.slice(0, limit);
      // PostgREST db-max-rows (max rows per response).
      // The settings tables hold about 10 rows, far below any realistic max-rows setting.
      if (
        options.maxRows !== undefined &&
        !table.startsWith("email_kind_") &&
        table !== "email_settings"
      ) {
        result = result.slice(0, options.maxRows);
      }
      return { data: result, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (value: Row) => {
        op = "insert";
        payload = value;
        return builder;
      },
      upsert: (values: Row[]) => {
        op = "upsert";
        upsertRows = values;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      update: (value: Row) => {
        op = "update";
        payload = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (!column.includes(".")) filters.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator !== "is") throw new Error(`未対応の not 演算子: ${operator}`);
        filters.push((row) => (row[column] ?? null) !== value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      gte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) >= value);
        return builder;
      },
      lt: (column: string, value: string) => {
        filters.push((row) => String(row[column]) < value);
        return builder;
      },
      lte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) <= value);
        return builder;
      },
      order: (column: string, opts: { ascending?: boolean } = {}) => {
        orders.push({ column, ascending: opts.ascending ?? true });
        return builder;
      },
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      range: (start: number, end: number) => {
        range = [start, end];
        return builder;
      },
      maybeSingle: async () => {
        const { data, error } = execute();
        return { data: error ? null : ((data as Row[])[0] ?? null), error };
      },
      single: async () => {
        const { data, error } = execute();
        return { data: error ? null : (data as Row[])[0], error };
      },
      // biome-ignore lint/suspicious/noThenProperty: mimics the Supabase query builder thenable
      then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
        Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return builder;
  }

  return { db, clock, failures, insertFailures, client: { from: vi.fn(from) } };
}

const APP_URL = "https://study.example.com";
/** Monday 2026-10-05, 08:00 JST. */
const MONDAY = new Date("2026-10-04T23:00:00Z");
/** Tuesday 2026-10-06, 08:00 JST. */
const TUESDAY = new Date("2026-10-05T23:00:00Z");

/** Pretend the user signed up at noon JST on the given JST calendar date. */
function createdOn(date: string): string {
  return `${date}T03:00:00.000Z`;
}

function userRow(id: number, overrides: Row = {}): Row {
  return {
    id,
    email: `u${id}@example.com`,
    display_name: `ユーザー${id}`,
    status: "active",
    role: "member",
    is_deleted: false,
    email_opt_out_at: null,
    created_at: createdOn("2026-08-01"),
    ...overrides,
  };
}

const themes: Row[] = [
  // Unpublished themes are excluded (top-level is_published filter).
  { id: 3, name: "未公開", display_order: 0, is_published: false, is_deleted: false, phases: [] },
  {
    id: 2,
    name: "Web制作",
    display_order: 2,
    is_published: true,
    is_deleted: false,
    phases: [
      {
        id: 20,
        name: "P2",
        display_order: 1,
        weeks: [
          {
            id: 200,
            name: "W2",
            display_order: 1,
            contents: [
              {
                id: 2000,
                title: "HTML入門",
                display_order: 1,
                is_open_to_trial: true,
                week_id: 200,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 1,
    name: "GAS実践",
    display_order: 1,
    is_published: true,
    is_deleted: false,
    phases: [
      {
        id: 10,
        name: "P1",
        display_order: 1,
        weeks: [
          {
            id: 100,
            name: "W1",
            display_order: 1,
            contents: [
              {
                id: 1001,
                title: "鍵付き",
                display_order: 2,
                is_open_to_trial: false,
                week_id: 100,
              },
              {
                id: 1000,
                title: "はじめての自動化",
                display_order: 1,
                is_open_to_trial: true,
                week_id: 100,
              },
            ],
          },
        ],
      },
    ],
  },
];

/** Rows equal to the migration's seed (behavior right after applying it is unchanged). */
function defaultKindRows(): Row[] {
  const row = (kind: string, extra: Row = {}): Row => ({
    kind,
    enabled: true,
    send_days: null,
    send_weekday: null,
    updated_at: "2026-10-01T00:00:00.000Z",
    updated_by: null,
    ...extra,
  });
  return [
    row("signup"),
    row("approved"),
    row("upgraded"),
    row("cancel_scheduled"),
    row("subscription_ended"),
    row("weekly_digest", { send_weekday: 1 }),
    row("inactivity_reminder", { send_days: [...INACTIVITY_REMINDER_DAYS] }),
    row("trial_nurture", { send_days: [...TRIAL_NURTURE_DAYS] }),
    row("announcement"),
  ];
}

function defaultSettingsRows(): Row[] {
  return [
    {
      id: 1,
      digest_daily_limit: EMAIL_DIGEST_MAX_PER_DAY,
      updated_at: "2026-10-01T00:00:00.000Z",
      updated_by: null,
    },
  ];
}

/** Default kind rows with per-kind overrides. */
function kindRows(overrides: Record<string, Row> = {}): Row[] {
  return defaultKindRows().map((row) => ({ ...row, ...overrides[row.kind as string] }));
}

function setup(
  tables: {
    users: Row[];
    user_progress?: Row[];
    submissions?: Row[];
    announcements?: Row[];
    email_kind_settings?: Row[];
    email_settings?: Row[];
  },
  options: { maxRows?: number } = {}
) {
  const fake = createFakeDb(
    {
      learning_themes: themes,
      user_progress: [],
      submissions: [],
      email_kind_settings: defaultKindRows(),
      email_settings: defaultSettingsRows(),
      ...tables,
    },
    options
  );
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake.client as never);
  fakeClock = fake.clock;
  return fake;
}

const noWait = { sleep: vi.fn(async () => {}) };

let fakeClock: { now: Date };

function sentLogs(db: Record<string, Row[]>): Row[] {
  return db.email_logs.filter((row) => row.kind !== "weekly_digest_reserved");
}

/** Runs the digest with the run time also applied to the DB's now() (email_logs.created_at). */
function runDigest(now: Date, options: Parameters<typeof runEmailDigest>[0] = {}) {
  fakeClock.now = now;
  return runEmailDigest({ now, ...noWait, ...options });
}

function sentTo(): string[] {
  return vi.mocked(sendEmail).mock.calls.map(([params]) => params.to);
}

function sentEmailTo(to: string) {
  const call = vi.mocked(sendEmail).mock.calls.find(([params]) => params.to === to);
  if (!call) throw new Error(`${to} へは送信していません`);
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "unsubscribe-secret");
  vi.stubEnv("STRIPE_ENABLED", "true");
  vi.mocked(sendEmail).mockResolvedValue({ status: "sent", messageId: "msg" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("送信設定（フェイルクローズ）", () => {
  it.each([
    "RESEND_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "NEXT_PUBLIC_APP_URL",
    "EMAIL_UNSUBSCRIBE_SECRET",
  ])("%s が未設定なら DB に触れず何も送らない", async (name) => {
    vi.stubEnv(name, "");
    const { client } = setup({ users: [userRow(1)] });

    const result = await runDigest(MONDAY);

    expect(result.status).toBe("skipped");
    expect(client.from).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("送信対象の抽出", () => {
  it("配信停止・却下・論理削除・受講生以外のロールのユーザーには送らない", async () => {
    setup({
      users: [
        userRow(1),
        userRow(2, { email_opt_out_at: "2026-10-01T00:00:00Z" }),
        userRow(3, { status: "rejected" }),
        userRow(4, { is_deleted: true }),
        userRow(5, { role: "admin" }),
      ],
    });

    await runDigest(MONDAY);

    expect(sentTo()).toEqual(["u1@example.com"]);
  });

  it("週次進捗: 先週（JST の月〜日）の完了数・提出数と、次に学ぶコンテンツを載せる", async () => {
    setup({
      users: [userRow(1)],
      user_progress: [
        // Exactly last Monday 0:00 JST (in range).
        {
          id: 1,
          user_id: 1,
          content_id: 1000,
          is_completed: true,
          completed_at: "2026-09-27T15:00:00.000Z",
        },
        // Week before last (out of range).
        {
          id: 2,
          user_id: 1,
          content_id: 2000,
          is_completed: true,
          completed_at: "2026-09-27T14:59:59.000Z",
        },
      ],
      submissions: [
        { id: 1, user_id: 1, submitted_at: "2026-10-04T14:59:59.000Z" }, // Sunday 23:59 JST (in range)
        { id: 2, user_id: 1, submitted_at: "2026-10-04T15:00:00.000Z" }, // This week's Monday (out of range)
      ],
    });

    await runDigest(MONDAY);

    const email = sentEmailTo("u1@example.com");
    expect(email.subject).toContain("今週の学習");
    expect(email.text).toContain("コンテンツ完了 1 本 / 演習の提出 1 件");
    expect(email.text).toContain("次に学ぶコンテンツ: 鍵付き");
    expect(email.text).toContain(`${APP_URL}/learn/1/10/100/1001`);
  });

  it("週次進捗: お試しユーザーはお試し公開コンテンツだけで次のコンテンツと残り数を判定する", async () => {
    setup({
      users: [userRow(1, { status: "trial" })],
      user_progress: [
        {
          id: 1,
          user_id: 1,
          content_id: 1000,
          is_completed: true,
          completed_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    });

    await runDigest(MONDAY);

    const email = sentEmailTo("u1@example.com");
    expect(email.text).toContain("次に学ぶコンテンツ: HTML入門");
    expect(email.text).toContain("残り 1 本");
  });

  it("週次進捗: 活動が無く、未完了も残っていないユーザーには送らない", async () => {
    setup({
      users: [userRow(1)],
      user_progress: [1000, 1001, 2000].map((contentId, i) => ({
        id: i + 1,
        user_id: 1,
        content_id: contentId,
        is_completed: true,
        completed_at: "2026-09-01T00:00:00.000Z",
      })),
    });

    await runDigest(MONDAY);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("週次進捗: 先週をまるごと利用できた（前週の月曜以前に登録した）ユーザーだけに送る", async () => {
    setup({
      users: [
        userRow(1, { created_at: createdOn("2026-09-28") }), // Monday of last week
        userRow(2, { created_at: createdOn("2026-09-29") }), // Tuesday of last week
        userRow(3, { created_at: createdOn("2026-10-04") }), // Sunday of last week (the day before this Monday)
      ],
      // u1 is day 7, so add learning records to exclude them from the unstudied reminder.
      user_progress: [
        {
          id: 1,
          user_id: 1,
          content_id: 1000,
          is_completed: true,
          completed_at: "2026-09-30T00:00:00.000Z",
        },
      ],
    });

    await runDigest(MONDAY);

    expect(sentTo()).toEqual(["u1@example.com"]);
    expect(sentEmailTo("u1@example.com").subject).toContain("今週の学習");
  });

  it("週次進捗: 今週（月曜以降）に登録したユーザーには送らない", async () => {
    setup({ users: [userRow(1, { created_at: "2026-10-04T15:30:00.000Z" })] });

    await runDigest(MONDAY);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("未学習リマインド: 登録から7日目で進捗も提出も無い active ユーザーに、最初の1本を案内する", async () => {
    setup({
      users: [
        userRow(1, { created_at: createdOn("2026-09-29") }), // no activity
        userRow(2, { created_at: createdOn("2026-09-29") }), // has progress
        userRow(3, { created_at: createdOn("2026-09-29") }), // has a submission
      ],
      user_progress: [
        { id: 1, user_id: 2, content_id: 1000, is_completed: false, completed_at: null },
      ],
      submissions: [{ id: 1, user_id: 3, submitted_at: "2026-10-01T00:00:00.000Z" }],
    });

    await runDigest(TUESDAY);

    // Day 7 is 10/6 (Tue). Only u1 gets the unstudied reminder; u2/u3 have studied. (They signed up
    // mid last week, so the Tuesday catch-up doesn't make them weekly digest targets either.)
    const reminder = sentEmailTo("u1@example.com");
    expect(reminder.subject).toContain("最初の1本");
    expect(reminder.text).toContain(`${APP_URL}/learn/1/10/100/1000`);
    expect(sentTo()).toEqual(["u1@example.com"]);
  });

  it("お試しユーザーの7日目は trial_nurture だけを送り、未学習リマインド・週次進捗は同日に送らない", async () => {
    const { db } = setup({
      users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-28") })],
    });

    await runDigest(MONDAY);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentEmailTo("u1@example.com").subject).toContain("本登録で学べる内容");
    expect(db.email_logs.map((row) => [row.kind, row.reference_key])).toEqual([
      // No weekly digest; carried over to later days in the same week.
      ["weekly_digest_reserved", "2026-10-05"],
      ["trial_nurture", "day7"],
    ]);
  });

  it("isStripeEnabled() が false のとき、Day7 の案内は /upgrade へ誘導しない", async () => {
    vi.stubEnv("STRIPE_ENABLED", "false");
    setup({ users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-28") })] });

    await runDigest(MONDAY);

    const email = sentEmailTo("u1@example.com");
    expect(email.text).not.toContain("/upgrade");
    expect(email.html).not.toContain("/upgrade");
    expect(email.text).toContain("本登録で学べるテーマ: GAS実践");
  });

  it("すべての定期メールに、本人用の配信停止リンクと List-Unsubscribe ヘッダーを付ける", async () => {
    setup({
      users: [
        userRow(1),
        userRow(2, { status: "trial", created_at: createdOn("2026-10-03") }), // day 2
        userRow(3, { created_at: createdOn("2026-09-28") }), // day 7, no activity
      ],
    });

    await runDigest(MONDAY);

    expect(sendEmail).toHaveBeenCalledTimes(3);
    for (const [params] of vi.mocked(sendEmail).mock.calls) {
      const userId = params.to.match(/^u(\d+)@/)?.[1];
      expect(params.text).toContain(`${APP_URL}/api/email/unsubscribe?token=${userId}.`);
      expect(params.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });
});

describe("二重送信の防止（email_logs の claim）", () => {
  it("同じ日に再実行しても、送信済みの分は送らない", async () => {
    const { db } = setup({
      users: [userRow(1), userRow(2, { status: "trial", created_at: createdOn("2026-10-03") })],
    });

    const first = await runDigest(MONDAY);
    const second = await runDigest(MONDAY);

    expect(first).toMatchObject({ status: "completed", sent: 2 });
    expect(second).toMatchObject({ status: "completed", sent: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sentLogs(db)).toHaveLength(2);
  });

  it("Cron の重複起動が並行しても、実行ロックを取れた1つだけが送る", async () => {
    const { db } = setup({ users: [userRow(1), userRow(2)] });

    const results = await Promise.all([runDigest(MONDAY), runDigest(MONDAY)]);

    expect(results.map((r) => r.status).sort()).toEqual(["completed", "skipped"]);
    expect(sentTo().sort()).toEqual(["u1@example.com", "u2@example.com"]);
    expect(db.cron_locks).toEqual([]);
  });

  it("同じ日に案内系メールを受け取ったユーザーには、朝の実行後にステータスが変わっても2通目を送らない", async () => {
    const { db } = setup({
      users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-28") })], // day 7
    });
    await runDigest(MONDAY);
    expect(sentEmailTo("u1@example.com").subject).toContain("本登録で学べる内容");

    // Admin approves the same day (would be an inactivity_reminder candidate if still unstudied),
    // then rerun.
    db.users[0].status = "active";
    await runDigest(new Date("2026-10-05T01:00:00Z"));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentLogs(db)).toHaveLength(1);
  });

  it("前日に案内系メールを受け取っていても、今日の分は送る", async () => {
    setup({ users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-21") })] });

    await runDigest(new Date("2026-10-04T23:00:00Z")); // 10/5 = day 14 (trial_nurture)
    await runDigest(new Date("2026-10-05T23:00:00Z")); // 10/6 = weekly digest carry-over

    expect(vi.mocked(sendEmail).mock.calls.map(([params]) => params.subject)).toEqual([
      expect.stringContaining("お試し期間のご案内"),
      expect.stringContaining("今週の学習"),
    ]);
  });

  it("送信に失敗した分は error を記録して行を残し、再実行で再送しない", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ status: "failed", error: "status=500" });
    const { db } = setup({ users: [userRow(1)] });

    const first = await runDigest(MONDAY);
    await runDigest(TUESDAY);

    expect(first).toMatchObject({ failed: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentLogs(db)[0]).toMatchObject({
      kind: "weekly_digest",
      reference_key: "2026-10-05",
      error: "status=500",
    });
  });
});

describe("1回あたりの上限と繰り越し", () => {
  const manyUsers = (count: number) => Array.from({ length: count }, (_, i) => userRow(i + 1));

  it(`送信は ${EMAIL_DIGEST_MAX_PER_DAY} 通で打ち切り、週次進捗の残りは同じ週の翌日に送る`, async () => {
    const { db } = setup({ users: manyUsers(EMAIL_DIGEST_MAX_PER_DAY + 5) });

    const monday = await runDigest(MONDAY);

    expect(monday).toMatchObject({ sent: EMAIL_DIGEST_MAX_PER_DAY, deferred: 5 });
    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY);

    const tuesday = await runDigest(TUESDAY);

    expect(tuesday).toMatchObject({ sent: 5, deferred: 0 });
    expect(new Set(sentTo()).size).toBe(EMAIL_DIGEST_MAX_PER_DAY + 5);
    expect(sentLogs(db).every((row) => row.reference_key === "2026-10-05")).toBe(true);
  });

  it("上限に掛かるときは、翌日に拾えない「N日目」の案内を週次進捗より先に送る", async () => {
    setup({
      users: [
        ...manyUsers(EMAIL_DIGEST_MAX_PER_DAY),
        userRow(1000, { status: "trial", created_at: createdOn("2026-10-03") }), // day 2
      ],
    });

    await runDigest(MONDAY);

    expect(sentTo()[0]).toBe("u1000@example.com");
    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY);
  });

  it("上限は1日（JST）の合計に効かせ、同じ日に再実行しても超えない", async () => {
    setup({ users: manyUsers(EMAIL_DIGEST_MAX_PER_DAY + 5) });
    await runDigest(MONDAY);

    const rerun = await runDigest(new Date("2026-10-05T00:30:00Z"));

    expect(rerun).toMatchObject({ sent: 0, deferred: 5 });
    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY);
  });

  it("Cron の重複起動が並行しても、合計の送信数は1日の上限を超えない", async () => {
    setup({ users: manyUsers(EMAIL_DIGEST_MAX_PER_DAY + 20) });

    await Promise.all([runDigest(MONDAY), runDigest(MONDAY)]);

    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY);
    expect(new Set(sentTo()).size).toBe(EMAIL_DIGEST_MAX_PER_DAY);
  });

  it("週次進捗は月曜の対象者だけに送り、週の途中で新しく対象になったユーザーには送らない", async () => {
    const { db } = setup({ users: [userRow(1)] });
    await runDigest(MONDAY);
    expect(sentTo()).toEqual(["u1@example.com"]);

    // A new student (signed up before last week) meeting the criteria on Tuesday isn't sent, since
    // there is no Monday reservation.
    db.users.push(userRow(2));
    const tuesday = await runDigest(TUESDAY);

    expect(tuesday).toMatchObject({ queued: 0 });
    expect(sentTo()).toEqual(["u1@example.com"]);
  });

  it("Cron を週の途中（金曜）に初めて動かしても、週次進捗は次の月曜まで送らず、予約が無いことを返す", async () => {
    setup({ users: [userRow(1), userRow(2)] });

    const friday = await runDigest(new Date("2026-10-08T23:00:00Z")); // Friday 10/9 JST

    expect(friday).toMatchObject({ queued: 0, weeklyReservationMissing: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("月曜の実行が完了しなかった（予約が1件も無い）週は、火曜の実行が月曜の代わりに対象を決めて送る", async () => {
    const { db } = setup({ users: [userRow(1), userRow(2)] });

    const tuesday = await runDigest(TUESDAY);

    expect(tuesday).toMatchObject({ sent: 2, weeklyReservationMissing: false });
    expect(sentEmailTo("u1@example.com").subject).toContain("今週の学習");
    expect(
      db.email_logs.filter((row) => row.kind === "weekly_digest_reserved").map((r) => r.user_id)
    ).toEqual([1, 2]);

    // Wednesday only judges carry-over per Tuesday's reservation (already sent, so nothing to
    // send).
    const wednesday = await runDigest(new Date("2026-10-06T23:00:00Z"));
    expect(wednesday).toMatchObject({ queued: 0, weeklyReservationMissing: false });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("月曜の実行が失敗して予約が無くても、火曜の実行で取り戻す", async () => {
    const { failures } = setup({ users: [userRow(1)] });
    failures.add("users:select");
    expect(await runDigest(MONDAY)).toEqual({ status: "failed" });
    failures.delete("users:select");

    const tuesday = await runDigest(TUESDAY);

    expect(tuesday).toMatchObject({ sent: 1 });
    expect(sentEmailTo("u1@example.com").subject).toContain("今週の学習");
  });

  it("予約が無いまま水曜以降になったら週次進捗は送らず、予約が無いことを返す", async () => {
    setup({ users: [userRow(1)] });

    const wednesday = await runDigest(new Date("2026-10-06T23:00:00Z")); // Wednesday 10/7 JST

    expect(wednesday).toMatchObject({ queued: 0, weeklyReservationMissing: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("月曜の繰り越し予約に失敗したら、1通も送らずに失敗を返す（再実行で予約からやり直せる）", async () => {
    const { db, failures } = setup({ users: manyUsers(3) });
    failures.add("email_logs:upsert");

    const failed = await runDigest(MONDAY);

    expect(failed).toEqual({ status: "failed" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.cron_locks).toEqual([]);

    failures.delete("email_logs:upsert");
    const retried = await runDigest(MONDAY);

    expect(retried).toMatchObject({ status: "completed", sent: 3 });
  });

  it("実行時間の上限を超えたら新しい送信を始めない", async () => {
    setup({ users: manyUsers(3) });
    let now = 0;
    vi.mocked(sendEmail).mockImplementation(async () => {
      now += 30_000;
      return { status: "sent", messageId: "msg" };
    });

    const result = await runDigest(MONDAY, { clock: () => now });

    expect(result).toMatchObject({ sent: 2, deferred: 1 });
  });

  it(`送信の開始間隔を ${EMAIL_DIGEST_SEND_INTERVAL_MS}ms 以上空ける（Resend のレート制限）`, async () => {
    setup({ users: manyUsers(3) });
    const sleep = vi.fn(async () => {});

    await runDigest(MONDAY, { clock: () => 0, sleep });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(EMAIL_DIGEST_SEND_INTERVAL_MS);
  });
});

describe("実行ロック（cron_locks）", () => {
  it("別の実行がロックを持っていれば、何もせずに skipped を返す", async () => {
    const { db } = setup({ users: [userRow(1)] });
    db.cron_locks = [{ name: "email-digest", locked_at: new Date().toISOString() }];

    const result = await runDigest(MONDAY);

    expect(result).toEqual({ status: "skipped", reason: "別の実行が進行中です" });
    expect(sendEmail).not.toHaveBeenCalled();
    // Don't delete another run's lock.
    expect(db.cron_locks).toHaveLength(1);
  });

  it("有効期限を過ぎたロック（ハードタイムアウト等で解放されなかったもの）は取り直して実行する", async () => {
    const { db } = setup({ users: [userRow(1)] });
    db.cron_locks = [
      { name: "email-digest", locked_at: new Date(Date.now() - 10 * 60_000).toISOString() },
    ];

    const result = await runDigest(MONDAY);

    expect(result).toMatchObject({ status: "completed", sent: 1 });
    expect(db.cron_locks).toEqual([]);
  });

  it("抽出が失敗してもロックを解放する", async () => {
    const { db, failures } = setup({ users: [userRow(1)] });
    failures.add("users:select");

    const result = await runDigest(MONDAY);

    expect(result).toEqual({ status: "failed" });
    expect(db.cron_locks).toEqual([]);
  });

  it("ロックを取れない DB エラーのときは失敗を返し、何も送らない", async () => {
    const { failures } = setup({ users: [userRow(1)] });
    failures.add("cron_locks:insert");

    const result = await runDigest(MONDAY);

    expect(result).toEqual({ status: "failed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("ページング", () => {
  it("サーバーの最大行数（db-max-rows）が 1000 未満でも、全件を取りこぼさない", async () => {
    // In an environment where a response holds at most 2 rows, send the weekly digest to all 5
    // users.
    setup({ users: Array.from({ length: 5 }, (_, i) => userRow(i + 1)) }, { maxRows: 2 });

    const result = await runDigest(MONDAY);

    expect(result).toMatchObject({ sent: 5 });
    expect(sentTo()).toHaveLength(5);
  });
});

describe("お知らせのメール一斉送信（#254）", () => {
  /**
   * 2026-10-07 (Wed) 08:00 JST: a weekday without a weekly digest reservation, to check
   * announcements alone.
   */
  const WEDNESDAY = new Date("2026-10-06T23:00:00Z");
  const THURSDAY = new Date("2026-10-07T23:00:00Z");

  function announcementRow(overrides: Row = {}): Row {
    return {
      id: 501,
      title: "もくもく会のご案内",
      body: "# 日時\n- 10/20 **20:00**\n\n[参加する](https://example.com/join)",
      target_statuses: ["active", "trial"],
      target_membership_types: null,
      published_at: "2026-10-06T01:00:00.000Z",
      send_email: true,
      email_sent_at: null,
      is_deleted: false,
      updated_at: "2026-10-06T01:00:00.000Z",
      ...overrides,
    };
  }

  const announcementLogs = (db: Record<string, Row[]>) =>
    db.email_logs.filter((row) => row.kind === "announcement");

  it("対象のステータス・会員種別に一致し、配信停止していない受講生にだけ送り、全員に送り終えたら email_sent_at を記録する", async () => {
    const { db } = setup({
      users: [
        userRow(1, { membership_type: "general" }),
        userRow(2, { membership_type: "community" }),
        userRow(3, { status: "trial" }),
        userRow(4, { membership_type: "general", email_opt_out_at: "2026-10-01T00:00:00Z" }),
        userRow(5, { role: "maintainer", membership_type: "general" }),
      ],
      announcements: [
        announcementRow({ target_statuses: ["active"], target_membership_types: ["general"] }),
      ],
    });

    const result = await runDigest(WEDNESDAY);

    expect(sentTo()).toEqual(["u1@example.com"]);
    expect(result).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
    expect(announcementLogs(db).map((row) => [row.user_id, row.reference_key])).toEqual([
      [1, "501"],
    ]);
  });

  it("本文の Markdown をメールに載せ、詳細ページへのリンクと配信停止リンクを付ける", async () => {
    setup({ users: [userRow(1)], announcements: [announcementRow()] });

    await runDigest(WEDNESDAY);

    const email = sentEmailTo("u1@example.com");
    expect(email.subject).toContain("お知らせ: もくもく会のご案内");
    expect(email.text).toContain("■ 日時");
    expect(email.text).toContain("・ 10/20 20:00");
    expect(email.html).toContain("<strong>20:00</strong>");
    expect(email.html).toContain('<a href="https://example.com/join"');
    expect(email.text).toContain(`お知らせを開く: ${APP_URL}/announcements/501`);
    expect(email.text).toContain(`${APP_URL}/api/email/unsubscribe?token=1.`);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("下書き・メール送信なし・削除済み・送信完了済みのお知らせは送らない", async () => {
    setup({
      users: [userRow(1)],
      announcements: [
        announcementRow({ id: 1, published_at: null }),
        announcementRow({ id: 2, send_email: false }),
        announcementRow({ id: 3, is_deleted: true }),
        announcementRow({ id: 4, email_sent_at: "2026-10-05T00:00:00Z" }),
      ],
    });

    await runDigest(WEDNESDAY);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("1日の上限を超える対象者は複数日に分けて送り、全員に送り終えた日に email_sent_at を記録する", async () => {
    const { db } = setup({
      users: Array.from({ length: EMAIL_DIGEST_MAX_PER_DAY + 5 }, (_, i) => userRow(i + 1)),
      announcements: [announcementRow()],
    });

    const first = await runDigest(WEDNESDAY);
    expect(first).toMatchObject({
      sent: EMAIL_DIGEST_MAX_PER_DAY,
      deferred: 5,
      announcementsCompleted: 0,
    });
    expect(db.announcements[0].email_sent_at).toBeNull();

    // A rerun the same day sends nothing since the daily cap is reached.
    const rerun = await runDigest(new Date("2026-10-07T01:00:00Z"));
    expect(rerun).toMatchObject({ sent: 0, announcementsCompleted: 0 });

    const second = await runDigest(THURSDAY);
    expect(second).toMatchObject({ sent: 5, deferred: 0, announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
    expect(new Set(sentTo()).size).toBe(EMAIL_DIGEST_MAX_PER_DAY + 5);
    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY + 5);
  });

  it("同じ日に登録からN日目の案内を受け取るユーザーには翌日に送り、それまで完了にしない", async () => {
    const { db } = setup({
      users: [userRow(1, { status: "trial", created_at: createdOn("2026-10-05") })], // day 2 on 10/7
      announcements: [announcementRow()],
    });

    const wednesday = await runDigest(WEDNESDAY);
    expect(sentEmailTo("u1@example.com").subject).toContain("演習を出してみましょう");
    expect(wednesday).toMatchObject({ sent: 1, announcementsCompleted: 0 });
    expect(db.announcements[0].email_sent_at).toBeNull();

    const thursday = await runDigest(THURSDAY);
    expect(thursday).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    expect(vi.mocked(sendEmail).mock.calls[1][0].subject).toContain("お知らせ");
  });

  it("月曜は週次進捗よりお知らせを先に送り、週次進捗は翌日に繰り越す", async () => {
    setup({ users: [userRow(1)], announcements: [announcementRow()] });

    await runDigest(MONDAY);
    await runDigest(TUESDAY);

    expect(vi.mocked(sendEmail).mock.calls.map(([params]) => params.subject)).toEqual([
      expect.stringContaining("お知らせ"),
      expect.stringContaining("今週の学習"),
    ]);
  });

  it("火曜以降は週次進捗の繰り越し分をお知らせより先に送り、大勢へのお知らせで週次進捗を押し出さない", async () => {
    const count = EMAIL_DIGEST_MAX_PER_DAY + 5;
    const { db } = setup({
      users: Array.from({ length: count }, (_, i) => userRow(i + 1)),
    });

    expect(await runDigest(MONDAY)).toMatchObject({ sent: EMAIL_DIGEST_MAX_PER_DAY, deferred: 5 });

    db.announcements = [announcementRow({ published_at: "2026-10-05T03:00:00.000Z" })];
    vi.mocked(sendEmail).mockClear();
    const tuesday = await runDigest(TUESDAY);

    const subjects = vi.mocked(sendEmail).mock.calls.map(([params]) => params.subject);
    expect(subjects.slice(0, 5)).toEqual(Array(5).fill(expect.stringContaining("今週の学習")));
    expect(subjects.slice(5)).toEqual(
      Array(EMAIL_DIGEST_MAX_PER_DAY - 5).fill(expect.stringContaining("お知らせ"))
    );
    expect(tuesday).toMatchObject({ sent: EMAIL_DIGEST_MAX_PER_DAY, announcementsCompleted: 0 });
    expect(sentLogs(db).filter((row) => row.kind === "weekly_digest")).toHaveLength(count);
  });

  it("claim が DB エラーで失敗した宛先が残っていれば完了にせず、翌日の実行で送ってから完了にする", async () => {
    const { db, insertFailures } = setup({
      users: [userRow(1), userRow(2), userRow(3)],
      announcements: [announcementRow()],
    });
    insertFailures.when = (table, value) =>
      table === "email_logs" && value.kind === "announcement" && value.user_id === 2;

    const wednesday = await runDigest(WEDNESDAY);

    expect(sentTo()).toEqual(["u1@example.com", "u3@example.com"]);
    expect(wednesday).toMatchObject({ failed: 1, announcementsCompleted: 0 });
    expect(db.announcements[0].email_sent_at).toBeNull();

    insertFailures.when = null;
    const thursday = await runDigest(THURSDAY);

    expect(sentTo()).toEqual(["u1@example.com", "u3@example.com", "u2@example.com"]);
    expect(thursday).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
  });

  it("Resend が受け付けなかった（429・5xx）宛先は完了にせず、翌日の実行で送り直してから完了にする", async () => {
    const { db } = setup({ users: [userRow(1), userRow(2)], announcements: [announcementRow()] });
    vi.mocked(sendEmail).mockImplementation(async ({ to }) =>
      to === "u2@example.com" && vi.mocked(sendEmail).mock.calls.length <= 2
        ? { status: "failed", error: "Resend API がエラーを返しました: status=429" }
        : { status: "sent", messageId: "msg" }
    );

    const wednesday = await runDigest(WEDNESDAY);
    expect(wednesday).toMatchObject({ sent: 1, failed: 1, announcementsCompleted: 0 });
    expect(db.announcements[0].email_sent_at).toBeNull();

    // A rerun the same day doesn't resend (failures aren't removed from today's promotional mail
    // count).
    const rerun = await runDigest(new Date("2026-10-07T01:00:00Z"));
    expect(rerun).toMatchObject({ sent: 0, failed: 0, announcementsCompleted: 0 });

    const thursday = await runDigest(THURSDAY);
    expect(thursday).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    expect(sentTo()).toEqual(["u1@example.com", "u2@example.com", "u2@example.com"]);
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
    // Delete the failed row before re-claiming (one row per user).
    expect(
      announcementLogs(db).map((row) => [row.user_id, row.sent_at !== null, row.error])
    ).toEqual([
      [1, true, null],
      [2, true, null],
    ]);
  });

  it("送れたか分からない失敗（タイムアウト等）は送り直さずに完了にする", async () => {
    const { db } = setup({ users: [userRow(1)], announcements: [announcementRow()] });
    vi.mocked(sendEmail).mockResolvedValue({
      status: "failed",
      error: "TimeoutError: The operation was aborted due to timeout",
    });

    const result = await runDigest(WEDNESDAY);
    await runDigest(THURSDAY);

    expect(result).toMatchObject({ failed: 1, announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it(`送り直すのは公開日から ${ANNOUNCEMENT_EMAIL_RETRY_DAYS} 日以内で、過ぎたら失敗のまま完了にする`, async () => {
    // Published 10/5 (Mon) JST. 10/7 and 10/8 are in the window, 10/9 is outside.
    const { db } = setup({
      users: [userRow(1)],
      announcements: [announcementRow({ published_at: "2026-10-05T01:00:00.000Z" })],
    });
    vi.mocked(sendEmail).mockResolvedValue({
      status: "failed",
      error: "Resend API がエラーを返しました: status=503",
    });

    const wednesday = await runDigest(WEDNESDAY);
    expect(wednesday).toMatchObject({ failed: 1, announcementsCompleted: 0 });

    const thursday = await runDigest(THURSDAY);
    expect(thursday).toMatchObject({ failed: 1, announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("送信中に対象を広げる編集が入ったら完了にせず、翌日の実行で広げた分に送ってから完了にする", async () => {
    const { db } = setup({
      users: [userRow(1), userRow(2, { status: "trial" })],
      announcements: [announcementRow({ target_statuses: ["active"] })],
    });
    vi.mocked(sendEmail).mockImplementationOnce(async () => {
      // Add trial users to the targets from the admin screen mid-send (updated_at is set by a
      // trigger).
      Object.assign(db.announcements[0], {
        target_statuses: ["active", "trial"],
        updated_at: "2026-10-06T23:00:01.000Z",
      });
      return { status: "sent", messageId: "msg" };
    });

    const wednesday = await runDigest(WEDNESDAY);
    expect(wednesday).toMatchObject({ sent: 1, announcementsCompleted: 0 });
    expect(db.announcements[0].email_sent_at).toBeNull();

    const thursday = await runDigest(THURSDAY);
    expect(thursday).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    expect(sentTo()).toEqual(["u1@example.com", "u2@example.com"]);
  });

  it("対象者がいないお知らせは送らずに完了にする", async () => {
    const { db } = setup({
      users: [userRow(1, { status: "trial" })],
      announcements: [announcementRow({ target_statuses: ["active"] })],
    });

    const result = await runDigest(WEDNESDAY);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ announcementsCompleted: 1 });
    expect(db.announcements[0].email_sent_at).toEqual(expect.any(String));
  });

  it("複数のお知らせは公開の古い順に1人1日1通ずつ送る", async () => {
    setup({
      users: [userRow(1)],
      announcements: [
        announcementRow({ id: 10, title: "新しい", published_at: "2026-10-06T02:00:00.000Z" }),
        announcementRow({ id: 9, title: "古い", published_at: "2026-10-06T01:00:00.000Z" }),
      ],
    });

    await runDigest(WEDNESDAY);
    await runDigest(THURSDAY);

    expect(vi.mocked(sendEmail).mock.calls.map(([params]) => params.subject)).toEqual([
      expect.stringContaining("古い"),
      expect.stringContaining("新しい"),
    ]);
  });
});

describe("メール通知の管理設定（#272）", () => {
  const WEDNESDAY = new Date("2026-10-06T23:00:00Z");
  const weeklyLogs = (db: Record<string, Row[]>) =>
    db.email_logs.filter((row) => row.kind === "weekly_digest");

  describe("設定を読めないとき（フェイルクローズ）", () => {
    it("種別設定の取得が DB エラーなら、案内系メールを1通も送らずに失敗を返す", async () => {
      const { failures, db } = setup({ users: [userRow(1)] });
      failures.add("email_kind_settings:select");
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await runDigest(MONDAY);

      expect(result).toEqual({ status: "failed" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.email_logs).toHaveLength(0);
    });

    it("1日の上限の行が無ければ送らない", async () => {
      setup({ users: [userRow(1)], email_settings: [] });
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await runDigest(MONDAY)).toEqual({ status: "failed" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("種別の行が欠けていれば（他の種別が有効でも）送らない", async () => {
      setup({
        users: [userRow(1)],
        email_kind_settings: defaultKindRows().filter((row) => row.kind !== "trial_nurture"),
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await runDigest(MONDAY)).toEqual({ status: "failed" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("必要な値（send_days / send_weekday）が空の行があれば送らない", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ trial_nurture: { send_days: null } }),
      });
      expect(await runDigest(MONDAY)).toEqual({ status: "failed" });

      setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ weekly_digest: { send_weekday: null } }),
      });
      expect(await runDigest(MONDAY)).toEqual({ status: "failed" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("失敗してもロックを解放し、設定が読めるようになった次の実行で送る", async () => {
      const { failures } = setup({ users: [userRow(1)] });
      vi.spyOn(console, "error").mockImplementation(() => {});
      failures.add("email_kind_settings:select");
      expect(await runDigest(MONDAY)).toEqual({ status: "failed" });

      failures.delete("email_kind_settings:select");
      expect(await runDigest(MONDAY)).toMatchObject({ status: "completed", sent: 1 });
    });
  });

  describe("無効な種別は対象にしない", () => {
    it("weekly_digest が無効なら、週次進捗を送らず繰り越し予約も作らない", async () => {
      const { db } = setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ weekly_digest: { enabled: false } }),
      });

      const result = await runDigest(MONDAY);

      expect(result).toMatchObject({ status: "completed", queued: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.email_logs).toHaveLength(0);
    });

    it("weekly_digest を無効にしても、週の途中の実行で「予約が無い」警告扱いにしない", async () => {
      setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ weekly_digest: { enabled: false } }),
      });

      expect(await runDigest(WEDNESDAY)).toMatchObject({ weeklyReservationMissing: false });
    });

    it("trial_nurture が無効ならお試し案内を送らない（他の種別は送る）", async () => {
      setup({
        users: [
          userRow(1, { status: "trial", created_at: createdOn("2026-10-03") }), // day 2
          userRow(2, { created_at: createdOn("2026-08-01") }),
        ],
        email_kind_settings: kindRows({ trial_nurture: { enabled: false } }),
      });

      await runDigest(MONDAY);

      expect(sentTo()).toEqual(["u2@example.com"]);
    });

    it("inactivity_reminder が無効なら未学習リマインドを送らない", async () => {
      setup({
        users: [userRow(1, { created_at: createdOn("2026-09-28") })], // day 7, no activity
        email_kind_settings: kindRows({
          inactivity_reminder: { enabled: false },
          weekly_digest: { enabled: false },
        }),
      });

      expect(await runDigest(MONDAY)).toMatchObject({ queued: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("announcement が無効ならお知らせを送らず、送信完了も記録しない（有効に戻したら送る）", async () => {
      const announcement = {
        id: 501,
        title: "お知らせ",
        body: "本文",
        target_statuses: ["active", "trial"],
        target_membership_types: null,
        published_at: "2026-10-06T01:00:00.000Z",
        send_email: true,
        email_sent_at: null,
        is_deleted: false,
        updated_at: "2026-10-06T01:00:00.000Z",
      };
      const { db } = setup({
        users: [userRow(1)],
        announcements: [announcement],
        email_kind_settings: kindRows({ announcement: { enabled: false } }),
      });

      expect(await runDigest(WEDNESDAY)).toMatchObject({ queued: 0, announcementsCompleted: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.announcements[0].email_sent_at).toBeNull();

      const announcementRow = db.email_kind_settings.find((row) => row.kind === "announcement");
      (announcementRow as Row).enabled = true;
      expect(await runDigest(WEDNESDAY)).toMatchObject({ sent: 1, announcementsCompleted: 1 });
    });
  });

  describe("送る日・曜日・上限の反映", () => {
    it("trial_nurture の send_days の日だけに送る（既定の日には送らない）", async () => {
      setup({
        users: [
          userRow(1, { status: "trial", created_at: createdOn("2026-10-02") }), // day 3
          userRow(2, { status: "trial", created_at: createdOn("2026-10-03") }), // day 2
        ],
        email_kind_settings: kindRows({
          trial_nurture: { send_days: [3, 20] },
          weekly_digest: { enabled: false },
        }),
      });

      await runDigest(MONDAY);

      expect(sentTo()).toEqual(["u1@example.com"]);
    });

    it("設定した日数に応じて、案内の本文は直近の段階のものになる", async () => {
      setup({
        users: [userRow(1, { status: "trial", created_at: createdOn("2026-10-02") })], // day 3
        email_kind_settings: kindRows({
          trial_nurture: { send_days: [3] },
          weekly_digest: { enabled: false },
        }),
      });

      await runDigest(MONDAY);

      expect(sentEmailTo("u1@example.com").subject).toContain("演習を出してみましょう");
    });

    it("inactivity_reminder の send_days の日に、進捗の無いユーザーへ送る", async () => {
      setup({
        users: [userRow(1, { created_at: createdOn("2026-10-01") })], // day 4
        email_kind_settings: kindRows({
          inactivity_reminder: { send_days: [4] },
          weekly_digest: { enabled: false },
        }),
      });

      await runDigest(MONDAY);

      expect(sentEmailTo("u1@example.com").subject).toContain("最初の1本");
    });

    it("send_weekday を水曜にすると、水曜に送り、reference_key はその水曜の日付になる", async () => {
      const { db } = setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ weekly_digest: { send_weekday: 3 } }),
      });

      const monday = await runDigest(MONDAY);
      expect(monday).toMatchObject({ queued: 0 });

      const wednesday = await runDigest(WEDNESDAY);
      expect(wednesday).toMatchObject({ sent: 1 });
      expect(weeklyLogs(db).map((row) => row.reference_key)).toEqual(["2026-10-07"]);
      expect(
        db.email_logs
          .filter((row) => row.kind === "weekly_digest_reserved")
          .map((row) => row.reference_key)
      ).toEqual(["2026-10-07"]);
    });

    it("「先週」は送信曜日の前日までの7日間で数える", async () => {
      setup({
        users: [userRow(1)],
        user_progress: [
          // 2026-09-30 00:00 JST (in the 7 days before Wed 10/7).
          {
            id: 1,
            user_id: 1,
            content_id: 1000,
            is_completed: true,
            completed_at: "2026-09-29T15:00:00.000Z",
          },
          // 2026-09-29 23:59 JST (out of range).
          {
            id: 2,
            user_id: 1,
            content_id: 2000,
            is_completed: true,
            completed_at: "2026-09-29T14:59:59.000Z",
          },
        ],
        email_kind_settings: kindRows({ weekly_digest: { send_weekday: 3 } }),
      });

      await runDigest(WEDNESDAY);

      expect(sentEmailTo("u1@example.com").text).toContain("コンテンツ完了 1 本");
    });

    it("送信曜日を週の途中に変えても、同じ週に週次進捗を2通送らない", async () => {
      const { db } = setup({ users: [userRow(1), userRow(2)] });

      // Sent Monday as usual.
      expect(await runDigest(MONDAY)).toMatchObject({ sent: 2 });

      // The admin then moves the send day to Wednesday of the same week.
      const weekly = db.email_kind_settings.find((row) => row.kind === "weekly_digest") as Row;
      weekly.send_weekday = 3;
      const wednesday = await runDigest(WEDNESDAY);

      expect(wednesday).toMatchObject({ sent: 0 });
      expect(weeklyLogs(db)).toHaveLength(2);
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("週の途中で曜日を変えても、障害の警告（予約なし）を出さずに次の送信日まで送らない", async () => {
      const { db } = setup({ users: [userRow(1)] });
      expect(await runDigest(MONDAY)).toMatchObject({ sent: 1 });

      // Tuesday: moved to Wednesday. The new cycle started last Wednesday and has no reservation.
      const weekly = db.email_kind_settings.find((row) => row.kind === "weekly_digest") as Row;
      weekly.send_weekday = 3;
      const tuesday = await runDigest(TUESDAY);

      expect(tuesday).toMatchObject({ sent: 0, weeklyReservationMissing: false });
      expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("予約が無い"));

      // Wednesday is a new cycle; the 10/5 digest is within 7 days, so no second mail either.
      expect(await runDigest(WEDNESDAY)).toMatchObject({
        sent: 0,
        weeklyReservationMissing: false,
      });
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("直近7日に送信も予約も無いまま送信日から2日以上過ぎたら、従来どおり予約なしを警告する", async () => {
      setup({ users: [userRow(1)] });

      expect(await runDigest(new Date("2026-10-07T23:00:00Z"))).toMatchObject({
        weeklyReservationMissing: true,
      });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("予約が無い"));
    });

    it("送信曜日を前に戻して7日以内に次の送信日が来ても、その回は送らず、次の週から通常どおり送る", async () => {
      const { db } = setup({
        users: [userRow(1)],
        email_kind_settings: kindRows({ weekly_digest: { send_weekday: 3 } }),
      });
      expect(await runDigest(WEDNESDAY)).toMatchObject({ sent: 1 });

      // Moved back to Monday: 10/12 is within 7 days of the 10/7 digest, so it is skipped.
      const weekly = db.email_kind_settings.find((row) => row.kind === "weekly_digest") as Row;
      weekly.send_weekday = 1;
      expect(await runDigest(new Date("2026-10-11T23:00:00Z"))).toMatchObject({ sent: 0 });
      // The following Monday (10/19) is a normal new cycle.
      expect(await runDigest(new Date("2026-10-18T23:00:00Z"))).toMatchObject({ sent: 1 });
      expect(weeklyLogs(db).map((row) => row.reference_key)).toEqual(["2026-10-07", "2026-10-19"]);
    });

    it("digest_daily_limit を超えて送らず、残りは週次進捗なら翌日に繰り越す", async () => {
      setup({
        users: [1, 2, 3, 4, 5].map((id) => userRow(id)),
        email_settings: [
          { id: 1, digest_daily_limit: 3, updated_at: "2026-10-01T00:00:00Z", updated_by: null },
        ],
      });

      const monday = await runDigest(MONDAY);
      expect(monday).toMatchObject({ sent: 3, deferred: 2 });

      const tuesday = await runDigest(TUESDAY);
      expect(tuesday).toMatchObject({ sent: 2 });
      expect(new Set(sentTo()).size).toBe(5);
    });

    it("実行の途中で上限を下げても、その日にすでに送った数を超えては送らない", async () => {
      const { db } = setup({ users: [1, 2, 3, 4].map((id) => userRow(id)) });
      // 2 already claimed today.
      db.email_settings[0].digest_daily_limit = 2;
      db.email_logs.push(
        {
          id: 901,
          user_id: 1,
          kind: "weekly_digest",
          reference_key: "2026-10-05",
          created_at: "2026-10-04T23:00:00.000Z",
          sent_at: "2026-10-04T23:00:01.000Z",
          error: null,
        },
        {
          id: 902,
          user_id: 2,
          kind: "weekly_digest",
          reference_key: "2026-10-05",
          created_at: "2026-10-04T23:00:00.000Z",
          sent_at: "2026-10-04T23:00:01.000Z",
          error: null,
        }
      );

      expect(await runDigest(MONDAY)).toMatchObject({ sent: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("設定は実行ごとに読み直す（キャッシュしない）", async () => {
      const { db } = setup({ users: [userRow(1)] });
      const weekly = db.email_kind_settings.find((row) => row.kind === "weekly_digest") as Row;
      weekly.enabled = false;
      expect(await runDigest(MONDAY)).toMatchObject({ queued: 0 });

      weekly.enabled = true;
      expect(await runDigest(MONDAY)).toMatchObject({ sent: 1 });
    });
  });
});
