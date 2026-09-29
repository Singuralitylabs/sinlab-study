import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/notifications/email")>()),
  sendEmail: vi.fn(),
}));

import {
  EMAIL_DIGEST_MAX_PER_DAY,
  EMAIL_DIGEST_SEND_INTERVAL_MS,
} from "@/app/constants/notifications";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { sendEmail } from "@/app/services/notifications/email";
import { runEmailDigest } from "@/app/services/notifications/email-digest-server";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/**
 * service_role クライアントの最小フェイク。テーブルを配列で持ち、eq / in / is / gte / lt /
 * range を実際に適用する（ネスト select の `phases.xxx` などドット付きの絞り込みは無視し、
 * 用意したツリーをそのまま返す）。`email_logs` の INSERT は UNIQUE (user_id, kind, reference_key)
 * を再現し、違反なら 23505 を返す。
 */
function createFakeDb(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = { email_logs: [], ...tables };
  let nextId = 1;
  /** INSERT した行の created_at（DB の now()）。runDigest() が実行日時に合わせる */
  const clock = { now: new Date() };
  /** `<table>:<op>` を入れると、その操作を DB エラーにする */
  const failures = new Set<string>();

  function from(table: string) {
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row = {};
    let upsertRows: Row[] = [];
    const filters: Filter[] = [];
    let range: [number, number] | null = null;

    // UNIQUE (user_id, kind, reference_key) と cron_locks の主キー (name)
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
        // ignoreDuplicates: true（ON CONFLICT DO NOTHING）
        for (const value of upsertRows) {
          if (!isDuplicate(rows, value)) {
            rows.push({ id: nextId++, created_at: clock.now.toISOString(), ...value });
          }
        }
        return { data: null, error: null };
      }
      if (op === "insert") {
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
      return { data: range ? matched.slice(range[0], range[1] + 1) : matched, error: null };
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
      order: () => builder,
      range: (start: number, end: number) => {
        range = [start, end];
        return builder;
      },
      single: async () => {
        const { data, error } = execute();
        return { data: error ? null : (data as Row[])[0], error };
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase クエリビルダーの thenable を再現するため意図的に定義
      then: (onfulfilled: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
        Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return builder;
  }

  return { db, clock, failures, client: { from: vi.fn(from) } };
}

const APP_URL = "https://study.example.com";
/** 2026-10-05（月）JST 8:00 */
const MONDAY = new Date("2026-10-04T23:00:00Z");
/** 2026-10-06（火）JST 8:00 */
const TUESDAY = new Date("2026-10-05T23:00:00Z");

/** JST の暦日 date の正午に登録したことにする */
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
  // 未公開テーマは返さない（トップレベルの is_published 絞り込み）
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

function setup(tables: { users: Row[]; user_progress?: Row[]; submissions?: Row[] }) {
  const fake = createFakeDb({
    learning_themes: themes,
    user_progress: [],
    submissions: [],
    ...tables,
  });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(fake.client as never);
  fakeClock = fake.clock;
  return fake;
}

const noWait = { sleep: vi.fn(async () => {}) };

let fakeClock: { now: Date };

/** 送信の claim 行（週次進捗の繰り越し予約を除く） */
function sentLogs(db: Record<string, Row[]>): Row[] {
  return db.email_logs.filter((row) => row.kind !== "weekly_digest_reserved");
}

/** 実行日時を DB の now()（email_logs.created_at）にも反映して定期メールを実行する */
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
        // 先週の月曜 0:00 JST ちょうど（範囲内）
        {
          id: 1,
          user_id: 1,
          content_id: 1000,
          is_completed: true,
          completed_at: "2026-09-27T15:00:00.000Z",
        },
        // 先々週（範囲外）
        {
          id: 2,
          user_id: 1,
          content_id: 2000,
          is_completed: true,
          completed_at: "2026-09-27T14:59:59.000Z",
        },
      ],
      submissions: [
        { id: 1, user_id: 1, submitted_at: "2026-10-04T14:59:59.000Z" }, // 日曜 23:59 JST（範囲内）
        { id: 2, user_id: 1, submitted_at: "2026-10-04T15:00:00.000Z" }, // 今週の月曜（範囲外）
      ],
    });

    await runDigest(MONDAY);

    const email = sentEmailTo("u1@example.com");
    expect(email.subject).toContain("今週の学習");
    expect(email.text).toContain("コンテンツ完了 1 本 / 演習の提出 1 件");
    // テーマ→フェーズ→週→コンテンツの表示順で、未完了の先頭（1000・2000 は完了済み）
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
        userRow(1, { created_at: createdOn("2026-09-28") }), // 前週の月曜
        userRow(2, { created_at: createdOn("2026-09-29") }), // 前週の火曜
        userRow(3, { created_at: createdOn("2026-10-04") }), // 前週の日曜（登録翌日が月曜）
      ],
      // u1 は 7 日目のため学習記録を付けて未学習リマインドの対象から外す
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
    setup({ users: [userRow(1, { created_at: "2026-10-04T15:30:00.000Z" })] }); // 月曜 0:30 JST

    await runDigest(MONDAY);

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("未学習リマインド: 登録から7日目で進捗も提出も無い active ユーザーに、最初の1本を案内する", async () => {
    setup({
      users: [
        userRow(1, { created_at: createdOn("2026-09-29") }), // 火曜 → 7日目（月曜なので週次とも重なる）
        userRow(2, { created_at: createdOn("2026-09-29") }), // 進捗あり
        userRow(3, { created_at: createdOn("2026-09-29") }), // 提出あり
      ],
      user_progress: [
        { id: 1, user_id: 2, content_id: 1000, is_completed: false, completed_at: null },
      ],
      submissions: [{ id: 1, user_id: 3, submitted_at: "2026-10-01T00:00:00.000Z" }],
    });

    await runDigest(TUESDAY);

    // 7日目は 10/6（火）。u1 だけが未学習リマインド。u2・u3 は学習済みのため送らない
    // （月曜の実行が無く週次進捗の繰り越し予約も無いため、火曜に週次進捗も送らない）
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
      // 週次進捗は送らず、同じ週の翌日以降に繰り越す
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
        userRow(2, { status: "trial", created_at: createdOn("2026-10-03") }), // 2日目
        userRow(3, { created_at: createdOn("2026-09-28") }), // 7日目・未学習
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
    // 終了時にロックを解放する
    expect(db.cron_locks).toEqual([]);
  });

  it("同じ日に案内系メールを受け取ったユーザーには、朝の実行後にステータスが変わっても2通目を送らない", async () => {
    const { db } = setup({
      users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-28") })], // 7日目
    });
    await runDigest(MONDAY);
    expect(sentEmailTo("u1@example.com").subject).toContain("本登録で学べる内容");

    // 同じ日に管理者が承認（未学習のままなら inactivity_reminder の候補になる）→ 再実行
    db.users[0].status = "active";
    await runDigest(new Date("2026-10-05T01:00:00Z"));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentLogs(db)).toHaveLength(1);
  });

  it("前日に案内系メールを受け取っていても、今日の分は送る", async () => {
    setup({ users: [userRow(1, { status: "trial", created_at: createdOn("2026-09-21") })] });

    await runDigest(new Date("2026-10-04T23:00:00Z")); // 10/5 = 14日目（trial_nurture）
    await runDigest(new Date("2026-10-05T23:00:00Z")); // 10/6 = 週次進捗の繰り越し

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
        userRow(1000, { status: "trial", created_at: createdOn("2026-10-03") }), // 2日目
      ],
    });

    await runDigest(MONDAY);

    expect(sentTo()[0]).toBe("u1000@example.com");
    expect(sendEmail).toHaveBeenCalledTimes(EMAIL_DIGEST_MAX_PER_DAY);
  });

  it("上限は1日（JST）の合計に効かせ、同じ日に再実行しても超えない", async () => {
    setup({ users: manyUsers(EMAIL_DIGEST_MAX_PER_DAY + 5) });
    await runDigest(MONDAY);

    // 同じ月曜の 9 時台に手動で再実行
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

    // 火曜に新しい受講生（先週以前の登録）が対象条件を満たしても、月曜の予約が無いため送らない
    db.users.push(userRow(2));
    const tuesday = await runDigest(TUESDAY);

    expect(tuesday).toMatchObject({ queued: 0 });
    expect(sentTo()).toEqual(["u1@example.com"]);
  });

  it("Cron を週の途中（金曜）に初めて動かしても、週次進捗は次の月曜まで送らない", async () => {
    setup({ users: [userRow(1), userRow(2)] });

    const friday = await runDigest(new Date("2026-10-08T23:00:00Z")); // 10/9（金）

    expect(friday).toMatchObject({ queued: 0 });
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
    // 他の実行のロックは消さない
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
