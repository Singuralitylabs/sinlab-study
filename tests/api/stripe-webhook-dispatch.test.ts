import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-server");
vi.mock("@/app/services/api/stripe-webhook-server");
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/stripe/webhook/route";
import { getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  releaseEventClaim,
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
  vi.mocked(claimEvent).mockResolvedValue({
    claimed: true,
    processedAt: "2026-01-01T00:00:00.000Z",
    error: null,
  });
  vi.mocked(releaseEventClaim).mockResolvedValue({ error: null });
  vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({ error: null, activated: true });
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
    // 事前にclaimしたうえでハンドラが実行される
    expect(claimEvent).toHaveBeenCalledWith("evt_1", "checkout.session.completed");
    expect(releaseEventClaim).not.toHaveBeenCalled();
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

  it("claimがDBエラーを返した場合は500を返し、ハンドラを呼ばない", async () => {
    vi.mocked(claimEvent).mockResolvedValue({
      claimed: false,
      processedAt: null,
      error: "db error",
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_claim_error",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
  });

  it("claimできない（再送・同時配信の重複）場合はハンドラを呼ばずスキップする", async () => {
    vi.mocked(claimEvent).mockResolvedValue({ claimed: false, processedAt: null, error: null });
    mockConstructEvent.mockReturnValue({
      id: "evt_5",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
  });

  it("ハンドラがエラーを返した場合は500を返し、claimを解放する（再送時にハンドラへ再到達させるため）", async () => {
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
      error: "失敗しました",
      activated: false,
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_6",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(releaseEventClaim).toHaveBeenCalledWith("evt_6", "2026-01-01T00:00:00.000Z");
  });

  it("claim後に例外が発生した場合も500を返し、claimを解放する", async () => {
    vi.mocked(activateUserFromCheckoutSession).mockRejectedValue(new Error("unexpected"));
    mockConstructEvent.mockReturnValue({
      id: "evt_7",
      type: "checkout.session.completed",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(releaseEventClaim).toHaveBeenCalledWith("evt_7", "2026-01-01T00:00:00.000Z");
  });
});
