import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLACK_WEBHOOK_TIMEOUT_MS } from "@/app/constants/notifications";
import {
  sendSlackFeedbackNotification,
  sendSlackNewUserNotification,
  sendSlackPaymentFailedNotification,
} from "@/app/services/notifications/slack";

const WEBHOOK_URL = "https://hooks.slack.example.com/services/xxx";

beforeEach(() => {
  vi.stubEnv("SLACK_NOTIFICATION_WEBHOOK_URL", WEBHOOK_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendSlackNewUserNotification", () => {
  it("fetchにSLACK_WEBHOOK_TIMEOUT_MSのAbortSignalタイムアウトを付与する", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackNewUserNotification({
      displayName: "テスト太郎",
      email: "test@example.com",
      adminUsersUrl: "https://example.com/admin/users",
    });

    expect(timeoutSpy).toHaveBeenCalledWith(SLACK_WEBHOOK_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("fetchがタイムアウト（TimeoutError）で例外を投げても呼び出し元へ伝播しない", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendSlackNewUserNotification({
        displayName: "テスト太郎",
        email: "test@example.com",
        adminUsersUrl: "https://example.com/admin/users",
      })
    ).resolves.toBeUndefined();
  });
});

describe("sendSlackPaymentFailedNotification", () => {
  it("fetchにSLACK_WEBHOOK_TIMEOUT_MSのAbortSignalタイムアウトを付与する", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackPaymentFailedNotification({
      customerEmail: "test@example.com",
      amountDue: 1000,
      hostedInvoiceUrl: null,
    });

    expect(timeoutSpy).toHaveBeenCalledWith(SLACK_WEBHOOK_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("fetchがタイムアウト（TimeoutError）で例外を投げても呼び出し元（Stripe Webhook主処理）へ伝播しない", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendSlackPaymentFailedNotification({
        customerEmail: "test@example.com",
        amountDue: 1000,
        hostedInvoiceUrl: null,
      })
    ).resolves.toBeUndefined();
  });
});

describe("sendSlackFeedbackNotification", () => {
  it("本文は plain_text で送り、空の pageUrl は「不明」にする", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackFeedbackNotification({
      feedbackId: 9,
      category: "bug",
      body: "<!channel> https://evil.example|偽リンク",
      pageUrl: "",
      manageUrl: "https://study.example.com/manage/feedbacks/9",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      blocks: Array<{ type: string; text?: { type: string; text: string }; fields?: unknown }>;
    };
    const fieldsBlock = payload.blocks.find((b) => b.type === "section" && Array.isArray(b.fields));
    expect(fieldsBlock).toBeDefined();
    const fields = fieldsBlock?.fields as Array<{ type: string; text: string }>;
    expect(fields.some((f) => f.type === "plain_text" && f.text === "不明")).toBe(true);

    const bodyBlock = payload.blocks.find(
      (b) => b.type === "section" && b.text?.type === "plain_text"
    );
    expect(bodyBlock?.text).toEqual({
      type: "plain_text",
      text: "<!channel> https://evil.example|偽リンク",
    });
    expect(
      payload.blocks.some(
        (b) =>
          b.type === "section" && b.text?.type === "mrkdwn" && b.text.text.includes("<!channel>")
      )
    ).toBe(false);
  });

  it("plan_inquiry は見出しをプランの相談にする", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendSlackFeedbackNotification({
      feedbackId: 12,
      category: "plan_inquiry",
      body: "コミュニティ会員に変更したいです",
      pageUrl: "https://study.example.com/upgrade",
      manageUrl: "https://study.example.com/manage/feedbacks/12",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      blocks: Array<{ type: string; text?: { type: string; text: string } }>;
    };
    const header = payload.blocks.find((b) => b.type === "header");
    expect(header?.text?.text).toBe("📝 プランの相談が届きました");
  });
});
