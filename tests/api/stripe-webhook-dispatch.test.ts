import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-server");
vi.mock("@/app/services/api/stripe-webhook-server");
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/stripe/webhook/route";
import { getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  isEventProcessed,
  recordEventProcessed,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackPaymentFailedNotification } from "@/app/services/notifications/slack";

const request = (body: string) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=dummy" },
    body,
  });

const mockConstructEvent = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
  vi.mocked(getStripeClient).mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as never);
  vi.mocked(isEventProcessed).mockResolvedValue({ processed: false, error: null });
  vi.mocked(recordEventProcessed).mockResolvedValue({ error: null });
  vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({ error: null });
  vi.mocked(syncSubscriptionStatus).mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/webhook - イベントディスパッチ", () => {
  it("checkout.session.completed はactivateUserFromCheckoutSessionを呼ぶ", async () => {
    const session = { id: "cs_1" };
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(activateUserFromCheckoutSession).toHaveBeenCalledWith(session);
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
    // ハンドラ成功後にのみ処理済みとして記録される
    expect(recordEventProcessed).toHaveBeenCalledWith("evt_1", "checkout.session.completed");
  });

  it.each([
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ])("%s はsyncSubscriptionStatusを呼ぶ", async (type) => {
    const subscription = { id: "sub_1" };
    mockConstructEvent.mockReturnValue({ id: "evt_2", type, data: { object: subscription } });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(syncSubscriptionStatus).toHaveBeenCalledWith(subscription);
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed は降格せずSlack通知のみ行う", async () => {
    const invoice = {
      customer_email: "user@example.com",
      amount_due: 1000,
      hosted_invoice_url: "https://invoice.stripe.com/xxx",
    };
    mockConstructEvent.mockReturnValue({
      id: "evt_3",
      type: "invoice.payment_failed",
      data: { object: invoice },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(sendSlackPaymentFailedNotification).toHaveBeenCalledWith({
      customerEmail: "user@example.com",
      amountDue: 1000,
      hostedInvoiceUrl: "https://invoice.stripe.com/xxx",
    });
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("未対応のイベントtypeは何もせず200を返す", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_4",
      type: "customer.created",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
    expect(sendSlackPaymentFailedNotification).not.toHaveBeenCalled();
  });

  it("再送済み（event.id重複）の場合はハンドラを呼ばずスキップする", async () => {
    vi.mocked(isEventProcessed).mockResolvedValue({ processed: true, error: null });
    mockConstructEvent.mockReturnValue({
      id: "evt_5",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    expect(recordEventProcessed).not.toHaveBeenCalled();
  });

  it("ハンドラがエラーを返した場合は500を返し、処理済みとして記録しない（再送時にハンドラへ再到達させるため）", async () => {
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({ error: "失敗しました" });
    mockConstructEvent.mockReturnValue({
      id: "evt_6",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(recordEventProcessed).not.toHaveBeenCalled();
  });
});
