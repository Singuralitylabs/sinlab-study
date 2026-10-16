import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/app/services/api/supabase-server", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

import { after } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import { EMAIL_KIND, WEB_PUSH_SEND_TIMEOUT_MS } from "@/app/constants/notifications";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { scheduleApprovedPush, sendPushToUser } from "@/app/services/notifications/push";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

let scheduled: Array<() => Promise<unknown>> = [];
async function runScheduled() {
  const tasks = scheduled;
  scheduled = [];
  await Promise.all(tasks.map((task) => task()));
}

const payload = { title: "件名", body: "本文", url: "/learn" };
const endpoint = "https://fcm.googleapis.com/fcm/send/device-1";

function enablePush() {
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:ops@example.com");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  scheduled = [];
  vi.mocked(after).mockImplementation((task) => {
    scheduled.push(task as () => Promise<unknown>);
  });
  vi.mocked(setVapidDetails).mockImplementation(() => undefined);
  enablePush();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendPushToUser", () => {
  it("環境変数が欠けると送らず、購読も claim しない", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "");
    const supabase = createMockSupabaseClient();

    await expect(
      sendPushToUser(1, EMAIL_KIND.APPROVED, "t", payload, supabase as never)
    ).resolves.toBe("skipped");
    expect(supabase.from).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("同じ事象の claim が既にあれば送らない", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_logs: [{ data: null, error: { code: "23505", message: "duplicate" } }],
      },
    });

    await expect(
      sendPushToUser(1, EMAIL_KIND.APPROVED, "t", payload, supabase as never)
    ).resolves.toBe("duplicate");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("setVapidDetails が throw したら claim せず failed を返す", async () => {
    vi.mocked(setVapidDetails).mockImplementation(() => {
      throw new Error("bad vapid private-key");
    });
    const supabase = createMockSupabaseClient();

    await expect(
      sendPushToUser(1, EMAIL_KIND.APPROVED, "t", payload, supabase as never)
    ).resolves.toBe("failed");
    expect(supabase.from).not.toHaveBeenCalled();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("private-key");
  });

  it("404 / 410 の購読は無効化し、秘密鍵はログに出さない。送れなければ claim を解放する", async () => {
    vi.mocked(sendNotification).mockRejectedValue(
      Object.assign(new Error("gone private-key"), { statusCode: 410 })
    );
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_logs: [
          { data: { id: 4 }, error: null },
          { data: null, error: null },
        ],
        push_subscriptions: [
          {
            data: [{ id: 9, endpoint, p256dh: "p", auth: "a" }],
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    await expect(
      sendPushToUser(1, EMAIL_KIND.INACTIVITY_REMINDER, "day7", payload, supabase as never)
    ).resolves.toBe("failed");

    const subscriptionUpdate = supabase.from.mock.results.find((_result, index) => {
      return supabase.from.mock.calls[index]?.[0] === "push_subscriptions" && index > 0;
    });
    expect(subscriptionUpdate).toBeDefined();
    const claimDelete = supabase.from.mock.results.find((_result, index) => {
      const builder = supabase.from.mock.results[index]?.value as {
        delete?: { mock?: { calls: unknown[] } };
      };
      return (
        supabase.from.mock.calls[index]?.[0] === "push_logs" &&
        (builder.delete?.mock?.calls.length ?? 0) > 0
      );
    });
    expect(claimDelete).toBeDefined();
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint }),
      expect.any(String),
      expect.objectContaining({ timeout: WEB_PUSH_SEND_TIMEOUT_MS })
    );
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("private-key");
  });

  it("送信ライブラリが秘密鍵を含む例外を出してもログから落とす", async () => {
    vi.mocked(sendNotification).mockRejectedValue(new Error("boom private-key"));
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_logs: [
          { data: { id: 4 }, error: null },
          { data: null, error: null },
        ],
        push_subscriptions: [
          {
            data: [{ id: 9, endpoint, p256dh: "p", auth: "a" }],
            error: null,
          },
        ],
      },
    });

    await expect(
      sendPushToUser(1, EMAIL_KIND.APPROVED, "t", payload, supabase as never)
    ).resolves.toBe("failed");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("[redacted]");
    expect(logged).not.toContain("private-key");
  });

  it("購読が無ければ送らず claim を解放する", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_logs: [
          { data: { id: 4 }, error: null },
          { data: null, error: null },
        ],
        push_subscriptions: [{ data: [], error: null }],
      },
    });

    await expect(
      sendPushToUser(1, EMAIL_KIND.APPROVED, "t", payload, supabase as never)
    ).resolves.toBe("skipped");
    expect(sendNotification).not.toHaveBeenCalled();
    const claimDelete = supabase.from.mock.results.find((_result, index) => {
      const builder = supabase.from.mock.results[index]?.value as {
        delete?: { mock?: { calls: unknown[] } };
      };
      return (
        supabase.from.mock.calls[index]?.[0] === "push_logs" &&
        (builder.delete?.mock?.calls.length ?? 0) > 0
      );
    });
    expect(claimDelete).toBeDefined();
  });
});

describe("scheduleApprovedPush", () => {
  it("push_enabled が false なら承認通知を送らない", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        email_kind_settings: { data: { push_enabled: false }, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(supabase as never);

    scheduleApprovedPush({ userId: 5, approvedAt: "2026-10-08T00:00:00.000Z" });
    await runScheduled();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("push_enabled が true のときだけ、承認時刻をキーに送る", async () => {
    vi.mocked(sendNotification).mockResolvedValue({} as never);
    const supabase = createMockSupabaseClient({
      tableResults: {
        email_kind_settings: { data: { push_enabled: true }, error: null },
        push_logs: [
          { data: { id: 1 }, error: null },
          { data: null, error: null },
        ],
        push_subscriptions: [
          {
            data: [{ id: 3, endpoint, p256dh: "p", auth: "a" }],
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(supabase as never);

    scheduleApprovedPush({ userId: 5, approvedAt: "2026-10-08T00:00:00.000Z" });
    await runScheduled();

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint }),
      JSON.stringify({
        title: "本登録が完了しました",
        body: "ダッシュボードから学習を続けられます",
        url: "/",
      }),
      expect.objectContaining({ timeout: WEB_PUSH_SEND_TIMEOUT_MS })
    );
  });
});
