import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLACK_WEBHOOK_TIMEOUT_MS } from "@/app/constants/notifications";
import {
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

  it("fetchがタイムアウト（AbortError）で例外を投げても呼び出し元へ伝播しない", async () => {
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

  it("fetchがタイムアウト（AbortError）で例外を投げても呼び出し元（Stripe Webhook主処理）へ伝播しない", async () => {
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
