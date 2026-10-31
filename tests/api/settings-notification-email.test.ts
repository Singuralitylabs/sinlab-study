import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_EMAIL_CONFIRM_LIMIT } from "@/app/constants/notifications";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/notifications/email")>()),
  sendEmail: vi.fn(),
}));

import { POST as cancelPending } from "@/app/api/settings/notification-email/cancel/route";
import { DELETE, POST as requestChange } from "@/app/api/settings/notification-email/route";
import { POST as confirmChange, GET } from "@/app/api/settings/notification-email/verify/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendEmail } from "@/app/services/notifications/email";

const APP_URL = "https://study.example.com";

type UserRow = {
  id: number;
  email: string;
  display_name: string;
  notification_email: string | null;
  notification_email_pending: string | null;
  notification_email_token_hash: string | null;
  notification_email_expires_at: string | null;
  is_deleted: boolean;
};

type LogRow = {
  id: number;
  user_id: number;
  kind: string;
  reference_key: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
  provider_message_id: string | null;
};

type Filter = { column: string; op: "eq" | "gt"; value: unknown };

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

function newUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 2,
    email: "login@example.com",
    display_name: "山田",
    notification_email: null,
    notification_email_pending: null,
    notification_email_token_hash: null,
    notification_email_expires_at: null,
    is_deleted: false,
    ...overrides,
  };
}

function createMemory(user: UserRow) {
  const logs: LogRow[] = [];
  const updates: Record<string, unknown>[] = [];
  let nextId = 1;

  const matches = (row: Record<string, unknown>, filters: Filter[]) =>
    filters.every((filter) => {
      const value = row[filter.column];
      if (filter.op === "gt") {
        return String(value) > String(filter.value);
      }
      return value === filter.value;
    });

  const from = (table: string) => {
    const filters: Filter[] = [];
    let payload: Record<string, unknown> | null = null;
    let op: "select" | "update" | "insert" = "select";

    const execute = () => {
      if (table === "email_settings" || table === "email_templates") {
        return { data: table === "email_templates" ? [] : null, error: null };
      }
      if (table === "users") {
        const row = user as unknown as Record<string, unknown>;
        const ok = matches(row, filters);
        if (op === "update") {
          updates.push(payload ?? {});
          if (ok && payload) {
            Object.assign(user, payload);
          }
        }
        return ok ? { data: { ...user }, error: null } : { data: null, error: null };
      }
      if (table === "email_logs" && op === "insert" && payload) {
        const log: LogRow = {
          id: nextId++,
          user_id: Number(payload.user_id),
          kind: String(payload.kind),
          reference_key: String(payload.reference_key),
          created_at: new Date().toISOString(),
          sent_at: null,
          error: null,
          provider_message_id: null,
        };
        logs.push(log);
        return { data: { id: log.id }, error: null };
      }
      if (table === "email_logs" && op === "update" && payload) {
        const log = logs.find((row) => matches(row as unknown as Record<string, unknown>, filters));
        if (log) {
          Object.assign(log, payload);
        }
        return { data: log ?? null, error: null };
      }
      return { data: null, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (value: Record<string, unknown>) => {
        op = "insert";
        payload = value;
        return builder;
      },
      update: (value: Record<string, unknown>) => {
        op = "update";
        payload = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, op: "eq", value });
        return builder;
      },
      gt: (column: string, value: unknown) => {
        filters.push({ column, op: "gt", value });
        return builder;
      },
      maybeSingle: () => Promise.resolve(execute()),
      // biome-ignore lint/suspicious/noThenProperty: mimics the Supabase query builder thenable
      then: (onfulfilled: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) =>
        Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return builder;
  };

  const rpc = (
    name: string,
    args: { p_user_id: number; p_reference_key: string; p_since: string; p_limit: number }
  ) => {
    if (name !== "claim_notification_email_confirm") {
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    }
    const count = logs.filter(
      (log) =>
        log.user_id === args.p_user_id &&
        log.kind === "notification_email_confirm" &&
        log.created_at >= args.p_since
    ).length;
    if (count >= args.p_limit) {
      return Promise.resolve({ data: null, error: null });
    }
    const id = nextId++;
    logs.push({
      id,
      user_id: args.p_user_id,
      kind: "notification_email_confirm",
      reference_key: args.p_reference_key,
      created_at: new Date().toISOString(),
      sent_at: null,
      error: null,
      provider_message_id: null,
    });
    return Promise.resolve({ data: id, error: null });
  };

  return { client: { from, rpc }, user, logs, updates };
}

function postChange(email: unknown) {
  return new Request("http://localhost/api/settings/notification-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

function verifyRequest(token: string, method: "GET" | "POST") {
  const url = new URL("https://study.example.com/api/settings/notification-email/verify");
  url.searchParams.set("token", token);
  return new NextRequest(url, { method });
}

function tokenFromMail(): string {
  const call = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
  const match = call?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error("確認メールにトークンがありません");
  }
  return match[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(sendEmail).mockResolvedValue({ status: "sent", messageId: "msg_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/settings/notification-email - 認可と検証", () => {
  it("未認証は401を返し、送信しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("notify@example.com"));

    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("userId 無しは403を返し、送信しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userId: null } as never);
    const res = await requestChange(postChange("notify@example.com"));
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(["rejected", null])("許可されていないステータス（%s）は403", async (userStatus) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus } as never);
    const res = await requestChange(postChange("notify@example.com"));
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("形式が違うアドレスは400で、users を更新しない", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("not-an-email"));

    expect(res.status).toBe(400);
    expect(memory.updates).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toContain("not-an-email");
  });

  it("現在の送り先と同じアドレスは400", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("login@example.com"));

    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(memory.user.notification_email).toBeNull();
  });
});

describe("POST /api/settings/notification-email - 確認待ち", () => {
  it("確認メールを新しいアドレスへ送り、リンクを開くまで切り替えない", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("  Notify@Example.com "));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.email).toBe("login@example.com");
    expect(memory.user.notification_email_pending).toBe("notify@example.com");
    expect(memory.updates.every((update) => !("email" in update))).toBe(true);

    const token = tokenFromMail();
    const hash = createHash("sha256").update(token).digest("hex");
    expect(memory.user.notification_email_token_hash).toBe(hash);
    expect(memory.user.notification_email_token_hash).not.toBe(token);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "notify@example.com" }));
    expect(vi.mocked(sendEmail).mock.calls[0][0].headers).toBeUndefined();
    expect(memory.logs[0]?.reference_key.startsWith("confirm:")).toBe(true);
    expect(memory.logs[0]?.reference_key).not.toContain(token);
    expect(memory.logs[0]?.reference_key).not.toContain("notify@example.com");

    const logged = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ];
    const dumped = JSON.stringify(logged);
    expect(dumped).not.toContain(token);
    expect(dumped).not.toContain("notify@example.com");
  });

  it("全体スイッチの行が無くても確認メールを送る", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    expect((await requestChange(postChange("notify@example.com"))).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("送信に失敗したら送り先を切り替えず、確認待ちも残さない", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ status: "failed", error: "status=500" });
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("notify@example.com"));

    expect(res.status).toBe(502);
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.notification_email_pending).toBeNull();
    expect(memory.user.notification_email_token_hash).toBeNull();
    expect(JSON.stringify(await res.json())).not.toContain("notify@example.com");
  });

  it("直近の確認メールが上限に達したら 429 で、それ以上送らない", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    for (let i = 1; i <= NOTIFICATION_EMAIL_CONFIRM_LIMIT; i++) {
      const res = await requestChange(postChange(`n${i}@example.com`));
      expect(res.status).toBe(200);
    }

    const blocked = await requestChange(postChange("n6@example.com"));
    expect(blocked.status).toBe(429);
    expect(sendEmail).toHaveBeenCalledTimes(NOTIFICATION_EMAIL_CONFIRM_LIMIT);
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.notification_email_pending).toBe(
      `n${NOTIFICATION_EMAIL_CONFIRM_LIMIT}@example.com`
    );
  });

  it("trial でも確認メールを依頼できる", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus: "trial" } as never);
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    expect((await requestChange(postChange("notify@example.com"))).status).toBe(200);
  });
});

describe("確認リンク", () => {
  async function requestPending() {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);
    expect((await requestChange(postChange("notify@example.com"))).status).toBe(200);
    return { memory, token: tokenFromMail() };
  }

  it("GET では切り替えず、画面にアドレスを出さない", async () => {
    const { memory, token } = await requestPending();

    const res = await GET(verifyRequest(token, "GET"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("変更を確定する");
    expect(html).not.toContain("notify@example.com");
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.notification_email_token_hash).not.toBeNull();
  });

  it("POST で切り替え、元のアドレスへ変更通知を送り、同じトークンはもう効かない", async () => {
    const { memory, token } = await requestPending();

    const res = await confirmChange(verifyRequest(token, "POST"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("変更しました");
    expect(html).toContain("/settings?notification_email=confirmed");
    expect(html).toContain("設定画面で確認する");
    expect(html).not.toContain("notify@example.com");
    expect(memory.user.notification_email).toBe("notify@example.com");
    expect(memory.user.email).toBe("login@example.com");
    expect(memory.user.notification_email_token_hash).toBeNull();
    expect(memory.user.notification_email_pending).toBeNull();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "login@example.com" }));
    const notice = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
    expect(notice?.headers).toBeUndefined();
    expect(notice?.text).not.toContain("api/email/unsubscribe");

    memory.user.notification_email = "other@example.com";
    const again = await confirmChange(verifyRequest(token, "POST"));
    expect(again.status).toBe(400);
    expect(memory.user.notification_email).toBe("other@example.com");
  });

  it("期限切れのトークンでは切り替えない", async () => {
    const { memory, token } = await requestPending();
    memory.user.notification_email_expires_at = "2000-01-01T00:00:00.000Z";

    const res = await confirmChange(verifyRequest(token, "POST"));

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("有効期限が切れています");
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.notification_email_pending).toBeNull();
    expect(memory.user.notification_email_token_hash).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("不正なトークンでは切り替えない", async () => {
    const { memory } = await requestPending();

    const res = await confirmChange(verifyRequest("not-a-valid-token", "POST"));

    expect(res.status).toBe(400);
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.notification_email_pending).toBe("notify@example.com");
  });
});

describe("解除と確認待ちの取り消し", () => {
  it("解除するとログイン用に戻り、それまでの送り先へ通知する", async () => {
    const memory = createMemory(newUser({ notification_email: "notify@example.com" }));
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(memory.user.notification_email).toBeNull();
    expect(memory.user.email).toBe("login@example.com");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "notify@example.com" }));
    expect(memory.updates.every((update) => !("email" in update))).toBe(true);
  });

  it("すでにログイン用なら通知を送らない", async () => {
    const memory = createMemory(newUser());
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    expect((await DELETE()).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("確認待ちの取り消しは送り先を変えない", async () => {
    const memory = createMemory(
      newUser({
        notification_email: "keep@example.com",
        notification_email_pending: "next@example.com",
        notification_email_token_hash: "abc",
        notification_email_expires_at: "2099-01-01T00:00:00.000Z",
      })
    );
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await cancelPending();

    expect(res.status).toBe(200);
    expect(memory.user.notification_email).toBe("keep@example.com");
    expect(memory.user.notification_email_pending).toBeNull();
    expect(memory.user.notification_email_token_hash).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("別の送り先があるときにログイン用を指定したら、解除を案内して送らない", async () => {
    const memory = createMemory(newUser({ notification_email: "notify@example.com" }));
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(memory.client as never);

    const res = await requestChange(postChange("login@example.com"));

    expect(res.status).toBe(400);
    expect(memory.user.notification_email).toBe("notify@example.com");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
