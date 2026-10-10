import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-server");
// Keep the real ownership verdict so the tests exercise what the route actually skips.
vi.mock("@/app/services/api/stripe-webhook-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/stripe-webhook-server")>();
  return {
    activateUserFromCheckoutSession: vi.fn(),
    claimEvent: vi.fn(),
    findMirrorOwner: vi.fn(),
    releaseEventClaim: vi.fn(),
    syncSubscriptionStatus: vi.fn(),
    extractUserId: actual.extractUserId,
    isForeignCheckoutSession: actual.isForeignCheckoutSession,
    CHECKOUT_SESSION_REJECTION_MESSAGES: actual.CHECKOUT_SESSION_REJECTION_MESSAGES,
  };
});
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/stripe/webhook/route";
import { getStripeClient, isStripeEnabled } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  findMirrorOwner,
  releaseEventClaim,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import {
  sendSlackCheckoutRecoveryNotification,
  sendSlackPaymentFailedNotification,
} from "@/app/services/notifications/slack";

const request = (body: string) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=dummy" },
    body,
  });

const mockConstructEvent = vi.fn();

// Shaped like a session from this app's createCheckoutSession().
const ownSession = {
  id: "cs_1",
  client_reference_id: "19",
  metadata: { user_id: "19", auth_id: "auth-19" },
  mode: "subscription",
  payment_link: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
  vi.mocked(isStripeEnabled).mockReturnValue(true);
  vi.mocked(getStripeClient).mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as never);
  vi.mocked(claimEvent).mockResolvedValue({
    claimed: true,
    processedAt: "2026-01-01T00:00:00.000Z",
    error: null,
  });
  vi.mocked(releaseEventClaim).mockResolvedValue({ error: null });
  vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
    error: null,
    activated: true,
    currentPeriodEnd: null,
  });
  vi.mocked(syncSubscriptionStatus).mockResolvedValue({ error: null });
  vi.mocked(findMirrorOwner).mockResolvedValue({ error: null, userId: 19 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/stripe/webhook - イベントディスパッチ", () => {
  it("checkout.session.completed はactivateUserFromCheckoutSessionを呼ぶ", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: ownSession },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(activateUserFromCheckoutSession).toHaveBeenCalledWith(ownSession);
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
    // Claim first, then run the handler.
    expect(claimEvent).toHaveBeenCalledWith("evt_1", "checkout.session.completed");
    expect(releaseEventClaim).not.toHaveBeenCalled();
  });

  it.each(["customer.subscription.updated", "customer.subscription.deleted"])(
    "%s はsyncSubscriptionStatusを呼ぶ",
    async (type) => {
      const subscription = { id: "sub_1" };
      mockConstructEvent.mockReturnValue({ id: "evt_2", type, data: { object: subscription } });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      expect(findMirrorOwner).toHaveBeenCalledWith("stripe_subscription_id", "sub_1");
      // The owner resolved before the claim is passed on, so the mirror is not read twice.
      expect(syncSubscriptionStatus).toHaveBeenCalledWith(subscription, 19);
      expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    }
  );

  it.each(["customer.subscription.updated", "customer.subscription.deleted"])(
    "ミラーに無い（他用途の）サブスクの %s はclaimも同期も行わず200でスキップする",
    async (type) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(findMirrorOwner).mockResolvedValue({ error: null, userId: null });
      mockConstructEvent.mockReturnValue({
        id: "evt_sub",
        type,
        data: { object: { id: "sub_x" } },
      });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
      expect(claimEvent).not.toHaveBeenCalled();
      expect(syncSubscriptionStatus).not.toHaveBeenCalled();
    }
  );

  it("invoice.payment_failed は降格せずSlack通知のみ行う", async () => {
    const invoice = {
      id: "in_1",
      customer: "cus_1",
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
    expect(findMirrorOwner).toHaveBeenCalledWith("stripe_customer_id", "cus_1");
    expect(sendSlackPaymentFailedNotification).toHaveBeenCalledWith({
      customerEmail: "user@example.com",
      amountDue: 1000,
      hostedInvoiceUrl: "https://invoice.stripe.com/xxx",
    });
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
  });

  it.each([
    { label: "ミラーに無いCustomer", customer: "cus_other", userId: null },
    { label: "展開済みでもミラーに無いCustomer", customer: { id: "cus_other" }, userId: null },
    { label: "Customerの無い", customer: null, userId: 19 },
  ])(
    "invoice.payment_failed: $label の請求は他用途としてclaimもSlack通知も行わず200でスキップする",
    async ({ customer, userId }) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(findMirrorOwner).mockResolvedValue({ error: null, userId });
      mockConstructEvent.mockReturnValue({
        id: "evt_inv",
        type: "invoice.payment_failed",
        data: {
          object: { id: "in_x", customer, customer_email: "other@example.com", amount_due: 5000 },
        },
      });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
      expect(claimEvent).not.toHaveBeenCalled();
      expect(sendSlackPaymentFailedNotification).not.toHaveBeenCalled();
    }
  );

  it("invoice.payment_failed: 本文のサブスクmetadataに auth_id があってもミラーに無いCustomerはStripeを呼ばずスキップする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findMirrorOwner).mockResolvedValue({ error: null, userId: null });
    mockConstructEvent.mockReturnValue({
      id: "evt_inv_meta",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_meta",
          customer: "cus_unmirrored",
          amount_due: 5000,
          parent: { subscription_details: { metadata: { user_id: "1", auth_id: "auth-1" } } },
        },
      },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
    // Only constructEvent touches the client: the verdict needs no Customer fetch per invoice.
    expect(getStripeClient).toHaveBeenCalledTimes(1);
    expect(claimEvent).not.toHaveBeenCalled();
    expect(sendSlackPaymentFailedNotification).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed: 展開済みのCustomerでもidでミラーと照合する", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_inv_expanded",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", customer: { id: "cus_1" }, amount_due: 1000 } },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(findMirrorOwner).toHaveBeenCalledWith("stripe_customer_id", "cus_1");
    expect(sendSlackPaymentFailedNotification).toHaveBeenCalled();
  });

  it.each([
    { type: "customer.subscription.updated", object: { id: "sub_1" } },
    { type: "invoice.payment_failed", object: { id: "in_1", customer: "cus_1" } },
  ])(
    "$type: ミラーの照合がDBエラーなら500を返し、claimしない（再送に委ねる）",
    async ({ type, object }) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(findMirrorOwner).mockResolvedValue({ error: "db error", userId: null });
      mockConstructEvent.mockReturnValue({ id: "evt_mirror_error", type, data: { object } });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(`id=evt_mirror_error type=${type}`)
      );
      expect(claimEvent).not.toHaveBeenCalled();
      expect(syncSubscriptionStatus).not.toHaveBeenCalled();
      expect(sendSlackPaymentFailedNotification).not.toHaveBeenCalled();
    }
  );

  it("未対応のイベントtypeはclaimもせず200でスキップする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockConstructEvent.mockReturnValue({
      id: "evt_4",
      type: "customer.created",
      data: { object: {} },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
    // No stripe_events row for event types the endpoint merely happens to receive.
    expect(claimEvent).not.toHaveBeenCalled();
    expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
    expect(syncSubscriptionStatus).not.toHaveBeenCalled();
    expect(sendSlackPaymentFailedNotification).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "自アプリの印（metadata.auth_id）が無い Payment Link 等の他用途の決済",
      session: { id: "cs_plink", client_reference_id: null, metadata: {}, mode: "payment" },
    },
    {
      // A buyer can append ?client_reference_id=42 to a shared subscription Payment Link URL.
      label: "client_reference_id 付きの subscription モードの Payment Link",
      session: {
        id: "cs_plink_sub",
        client_reference_id: "42",
        metadata: {},
        mode: "subscription",
        payment_link: "plink_x",
      },
    },
    {
      label: "metadata.auth_id があっても payment_link 付き",
      session: { ...ownSession, id: "cs_plink_meta", payment_link: "plink_x" },
    },
    {
      label: "client_reference_id はあるが metadata.auth_id が無い",
      session: { id: "cs_noauth", client_reference_id: "19", metadata: null, mode: "subscription" },
    },
    {
      label: "client_reference_id が数値でない",
      session: {
        id: "cs_nan",
        client_reference_id: "order-abc",
        metadata: {},
        mode: "subscription",
      },
    },
    {
      label: "自アプリの印はあるが mode が subscription ではない",
      session: { ...ownSession, id: "cs_pay", mode: "payment" },
    },
  ])(
    "checkout.session.completed: $label はclaimも昇格処理も行わず200でスキップする",
    async ({ session }) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockConstructEvent.mockReturnValue({
        id: "evt_foreign",
        type: "checkout.session.completed",
        data: { object: session },
      });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ received: true, skipped: true });
      // Judged before the claim, so no stripe_events row is written for foreign sales.
      expect(claimEvent).not.toHaveBeenCalled();
      expect(activateUserFromCheckoutSession).not.toHaveBeenCalled();
      expect(releaseEventClaim).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    }
  );

  it("checkout.session.completed: 他用途の決済はclaimがDBエラーになる状況でも200でスキップする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(claimEvent).mockResolvedValue({
      claimed: false,
      processedAt: null,
      error: "db error",
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_foreign_claim_error",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_plink", client_reference_id: null, metadata: {}, mode: "payment" },
      },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(claimEvent).not.toHaveBeenCalled();
  });

  it("checkout.session.completed: metadata.user_id だけのセッションも自アプリのものとして昇格処理を呼ぶ", async () => {
    const session = { ...ownSession, id: "cs_meta", client_reference_id: null };
    mockConstructEvent.mockReturnValue({
      id: "evt_meta",
      type: "checkout.session.completed",
      data: { object: session },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(200);
    expect(activateUserFromCheckoutSession).toHaveBeenCalledWith(session);
  });

  it.each([
    { label: "ユーザーidが無い", ids: { client_reference_id: null, metadata: { auth_id: "a" } } },
    {
      label: "ユーザーidが10進の正の整数でない",
      ids: { client_reference_id: "0x2a", metadata: { user_id: "0x2a", auth_id: "a" } },
    },
  ])(
    "checkout.session.completed: 自アプリの印はあるが$label 場合は再送しても変わらないため200で受領し、claimを解放しない",
    async ({ ids }) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      // The real function returns its "user not identified" rejection before touching the DB.
      const actual = await vi.importActual<
        typeof import("@/app/services/api/stripe-webhook-server")
      >("@/app/services/api/stripe-webhook-server");
      vi.mocked(activateUserFromCheckoutSession).mockImplementation(
        actual.activateUserFromCheckoutSession
      );
      mockConstructEvent.mockReturnValue({
        id: "evt_own_nouser",
        type: "checkout.session.completed",
        data: { object: { ...ownSession, id: "cs_own_nouser", ...ids } },
      });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      expect(claimEvent).toHaveBeenCalledWith("evt_own_nouser", "checkout.session.completed");
      expect(releaseEventClaim).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("id=cs_own_nouser"));
      expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
        userId: null,
        reason: "Checkoutセッションからユーザーを特定できませんでした",
        sessionIds: ["cs_own_nouser"],
      });
    }
  );

  it.each([
    {
      rejection: "owner_mismatch" as const,
      reason: "Checkoutセッションのユーザーが一致しません",
    },
    {
      rejection: "missing_stripe_ids" as const,
      reason: "Checkoutセッションにcustomer/subscription情報がありません",
    },
  ])(
    "checkout.session.completed: $rejection は再送しても変わらないため200で受領してclaimを保持し、運用者へSlack通知する",
    async ({ rejection, reason }) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
        error: null,
        rejection,
        activated: false,
        currentPeriodEnd: null,
      });
      mockConstructEvent.mockReturnValue({
        id: "evt_rejected",
        type: "checkout.session.completed",
        data: { object: ownSession },
      });

      const res = await POST(request("{}") as never);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ received: true });
      expect(claimEvent).toHaveBeenCalledWith("evt_rejected", "checkout.session.completed");
      expect(releaseEventClaim).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(reason));
      // The kept claim stops redeliveries, so this notice is the only one operators get.
      expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
        userId: 19,
        reason,
        sessionIds: ["cs_1"],
      });
    }
  );

  it("checkout.session.completed: 一時的なエラー（DB障害等）は500でclaimを解放し、Slack通知しない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
      error: "db error",
      activated: false,
      currentPeriodEnd: null,
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_transient",
      type: "checkout.session.completed",
      data: { object: ownSession },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(releaseEventClaim).toHaveBeenCalledWith("evt_transient", "2026-01-01T00:00:00.000Z");
    expect(sendSlackCheckoutRecoveryNotification).not.toHaveBeenCalled();
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
      data: { object: ownSession },
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
      data: { object: ownSession },
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
      currentPeriodEnd: null,
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_6",
      type: "checkout.session.completed",
      data: { object: ownSession },
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
      data: { object: ownSession },
    });

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(500);
    expect(releaseEventClaim).toHaveBeenCalledWith("evt_7", "2026-01-01T00:00:00.000Z");
  });

  it("STRIPE_ENABLEDが無効な場合は署名検証前に503を返す", async () => {
    vi.mocked(isStripeEnabled).mockReturnValue(false);

    const res = await POST(request("{}") as never);

    expect(res.status).toBe(503);
    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(claimEvent).not.toHaveBeenCalled();
  });
});
