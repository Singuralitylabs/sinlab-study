import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type QueryResult } from "@/tests/helpers/supabase-mock";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/notifications/email")>()),
  sendEmail: vi.fn(),
}));

import { after } from "next/server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { sendEmail } from "@/app/services/notifications/email";
import {
  deliverUserEmail,
  scheduleApprovedEmail,
  scheduleCancelScheduledEmail,
  scheduleSignupEmail,
  scheduleSubscriptionEndedEmail,
  scheduleUpgradedEmail,
} from "@/app/services/notifications/user-emails";

const APP_URL = "https://study.example.com";
const recipientRow = { id: 7, email: "user@example.com", display_name: "山田" };
const duplicate = { data: null, error: { code: "23505", message: "duplicate key" } };

/** after() に渡されたコールバックを保持し、テストから明示的に実行する */
let scheduled: Array<() => Promise<unknown>> = [];
async function runScheduled() {
  const tasks = scheduled;
  scheduled = [];
  await Promise.all(tasks.map((task) => task()));
}

function mockAdmin(tableResults: Record<string, QueryResult | QueryResult[]>) {
  const client = createMockSupabaseClient({ tableResults });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
  return client;
}

function emailLogBuilders(client: ReturnType<typeof mockAdmin>) {
  return client.from.mock.calls
    .map(([table], index) => ({ table, builder: client.from.mock.results[index].value }))
    .filter(({ table }) => table === "email_logs")
    .map(({ builder }) => builder);
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduled = [];
  vi.mocked(after).mockImplementation((task) => {
    scheduled.push(task as () => Promise<unknown>);
  });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  vi.stubEnv("STRIPE_ENABLED", "true");
  vi.mocked(sendEmail).mockResolvedValue({ status: "sent", messageId: "msg_1" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const deliverParams = {
  kind: "upgraded" as const,
  referenceKey: "sub_123",
  recipient: { userId: 7, email: "user@example.com", displayName: "山田" },
  content: { subject: "件名", text: "本文", html: "<p>本文</p>" },
};

describe("deliverUserEmail", () => {
  it("email_logs へ claim を INSERT してから送信し、成功を同じ行に記録する", async () => {
    const client = mockAdmin({
      email_logs: [
        { data: { id: 11 }, error: null },
        { data: null, error: null },
      ],
    });

    const result = await deliverUserEmail(deliverParams);

    expect(result).toBe("sent");
    const [claim, record] = emailLogBuilders(client);
    expect(claim.insert).toHaveBeenCalledWith({
      user_id: 7,
      kind: "upgraded",
      reference_key: "sub_123",
    });
    expect(sendEmail).toHaveBeenCalledWith({ to: "user@example.com", ...deliverParams.content });
    expect(record.update).toHaveBeenCalledWith({
      sent_at: expect.any(String),
      provider_message_id: "msg_1",
    });
    expect(record.eq).toHaveBeenCalledWith("id", 11);
  });

  it("UNIQUE 違反（同一事象を別経路・再送が送信済み）なら送信しない", async () => {
    const client = mockAdmin({ email_logs: duplicate });

    const result = await deliverUserEmail(deliverParams);

    expect(result).toBe("duplicate");
    expect(sendEmail).not.toHaveBeenCalled();
    // claim の INSERT のみで、記録の UPDATE は行わない
    expect(emailLogBuilders(client)).toHaveLength(1);
  });

  it("claim が他のDBエラーで失敗した場合は、二重送信を防げないため送信しない", async () => {
    mockAdmin({ email_logs: { data: null, error: { code: "PGRST000", message: "db down" } } });

    const result = await deliverUserEmail(deliverParams);

    expect(result).toBe("failed");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("送信に失敗した場合は error を記録して行を残す（再送しない）", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ status: "failed", error: "status=500" });
    const client = mockAdmin({
      email_logs: [
        { data: { id: 11 }, error: null },
        { data: null, error: null },
      ],
    });

    const result = await deliverUserEmail(deliverParams);

    expect(result).toBe("failed");
    const [, record] = emailLogBuilders(client);
    expect(record.update).toHaveBeenCalledWith({ error: "status=500" });
    expect(record.delete).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("送信設定が無い環境では claim もせずスキップする", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const client = mockAdmin({});

    const result = await deliverUserEmail(deliverParams);

    expect(result).toBe("skipped");
    expect(client.from).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("同一事象が並行して2回届いても（Webhook と /upgrade/success）1通だけ送る", async () => {
    mockAdmin({
      email_logs: [{ data: { id: 11 }, error: null }, duplicate, { data: null, error: null }],
    });

    const results = await Promise.all([
      deliverUserEmail(deliverParams),
      deliverUserEmail(deliverParams),
    ]);

    expect(results.sort()).toEqual(["duplicate", "sent"]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("schedule*Email（after() による予約）", () => {
  it("呼び出し時点では送信せず、after() に予約するだけ（レスポンスを遅らせない）", () => {
    mockAdmin({ users: { data: recipientRow, error: null } });

    scheduleSubscriptionEndedEmail({ userId: 7, subscriptionId: "sub_123" });

    expect(after).toHaveBeenCalledTimes(1);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("after() が使えない（リクエストスコープ外で throw する）場合も例外を投げず、その場で送信する", async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error("outside request scope");
    });
    mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
      ],
    });

    expect(() =>
      scheduleSubscriptionEndedEmail({ userId: 7, subscriptionId: "sub_123" })
    ).not.toThrow();
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
  });

  it("予約した処理が例外を投げても握りつぶす（主処理へ伝播しない）", async () => {
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("service role missing"));

    scheduleApprovedEmail({ userId: 7, membershipType: "community", approvedAt: "t" });

    await expect(runScheduled()).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("NEXT_PUBLIC_APP_URL が未設定ならリンクを作れないため、宛先も読まずスキップする", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const client = mockAdmin({ users: { data: recipientRow, error: null } });

    scheduleSubscriptionEndedEmail({ userId: 7, subscriptionId: "sub_123" });
    await runScheduled();

    expect(client.from).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("宛先ユーザーが見つからない（論理削除済み等）場合は claim せずスキップする", async () => {
    const client = mockAdmin({ users: { data: null, error: null } });

    scheduleSubscriptionEndedEmail({ userId: 7, subscriptionId: "sub_123" });
    await runScheduled();

    const builder = client.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(emailLogBuilders(client)).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("signup: auth_id で登録ユーザーを引き直し、users.id を reference_key にする", async () => {
    const client = mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
      ],
    });

    scheduleSignupEmail({ authId: "auth-uuid-1" });
    await runScheduled();

    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith("auth_id", "auth-uuid-1");
    const [claim] = emailLogBuilders(client);
    expect(claim.insert).toHaveBeenCalledWith({
      user_id: 7,
      kind: "signup",
      reference_key: "7",
    });
    const sent = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sent.to).toBe("user@example.com");
    expect(sent.text).toContain(`${APP_URL}/learn`);
  });

  it("approved: 承認時刻を reference_key にし、会員種別のラベルを載せる", async () => {
    const client = mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
      ],
    });

    scheduleApprovedEmail({
      userId: 7,
      membershipType: "general",
      approvedAt: "2026-09-28T00:00:00.000Z",
    });
    await runScheduled();

    const [claim] = emailLogBuilders(client);
    expect(claim.insert).toHaveBeenCalledWith({
      user_id: 7,
      kind: "approved",
      reference_key: "2026-09-28T00:00:00.000Z",
    });
    expect(vi.mocked(sendEmail).mock.calls[0][0].text).toContain("会員種別: 一般有料会員");
  });

  it("upgraded: 契約idを reference_key にし、実請求額と次回請求日（JST）を載せる", async () => {
    const client = mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
      ],
    });

    scheduleUpgradedEmail({
      userId: 7,
      subscriptionId: "sub_123",
      monthlyAmountJpy: 1500,
      currentPeriodEnd: "2026-10-26T15:00:00.000Z",
    });
    await runScheduled();

    const [claim] = emailLogBuilders(client);
    expect(claim.insert).toHaveBeenCalledWith({
      user_id: 7,
      kind: "upgraded",
      reference_key: "sub_123",
    });
    const text = vi.mocked(sendEmail).mock.calls[0][0].text;
    expect(text).toContain("料金: 月額1,500円（税込）");
    expect(text).toContain("次回のお支払い予定日: 2026/10/27");
  });

  it("upgraded: 実請求額が null なら料金の行を載せない（表示用フォールバック額で代用しない）", async () => {
    mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
      ],
    });

    scheduleUpgradedEmail({
      userId: 7,
      subscriptionId: "sub_123",
      monthlyAmountJpy: null,
      currentPeriodEnd: null,
    });
    await runScheduled();

    const text = vi.mocked(sendEmail).mock.calls[0][0].text;
    expect(text).not.toContain("料金:");
    expect(text).not.toContain("1,500");
  });

  it("cancel_scheduled / subscription_ended: 契約idを reference_key にする", async () => {
    const client = mockAdmin({
      users: { data: recipientRow, error: null },
      email_logs: [
        { data: { id: 1 }, error: null },
        { data: null, error: null },
        { data: { id: 2 }, error: null },
        { data: null, error: null },
      ],
    });

    scheduleCancelScheduledEmail({
      userId: 7,
      subscriptionId: "sub_123",
      currentPeriodEnd: "2026-10-26T15:00:00.000Z",
    });
    await runScheduled();
    scheduleSubscriptionEndedEmail({ userId: 7, subscriptionId: "sub_123" });
    await runScheduled();

    const claims = emailLogBuilders(client).filter((builder) => builder.insert.mock.calls.length);
    expect(claims.map((builder) => builder.insert.mock.calls[0][0])).toEqual([
      { user_id: 7, kind: "cancel_scheduled", reference_key: "sub_123" },
      { user_id: 7, kind: "subscription_ended", reference_key: "sub_123" },
    ]);
    expect(vi.mocked(sendEmail).mock.calls[0][0].text).toContain("2026/10/27 まで");
  });
});
