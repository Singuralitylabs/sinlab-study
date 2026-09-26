import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-webhook-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-webhook-server")>()),
  activateUserFromCheckoutSession: vi.fn(),
  claimEvent: vi.fn(),
  reactivateUserFromMirror: vi.fn(),
}));
vi.mock("@/app/services/notifications/slack");

import {
  reactivatePaidTrialUser,
  recoverCompletedCheckout,
} from "@/app/services/api/stripe-checkout-recovery-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  reactivateUserFromMirror,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

const heldClaimedAt = "2026-09-20T00:00:00+00:00";
const paidSession = {
  id: "cs_paid",
  status: "complete",
  client_reference_id: "5",
  metadata: { user_id: "5" },
  customer: "cus_1",
  subscription: "sub_1",
} as never;

function stripeError(statusCode: number) {
  return new Stripe.errors.StripeInvalidRequestError({
    message: "request failed",
    type: "invalid_request_error",
    statusCode,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimEvent).mockResolvedValue({
    claimed: true,
    processedAt: "2026-09-26T04:00:00.000Z",
    error: null,
  });
});

describe("recoverCompletedCheckout", () => {
  it("反映して昇格すれば activated とセッションidを返す（観測した処理権を渡す）", async () => {
    vi.mocked(activateUserFromCheckoutSession).mockResolvedValue({
      error: null,
      activated: true,
      currentPeriodEnd: null,
    });

    const result = await recoverCompletedCheckout(5, [paidSession], heldClaimedAt);

    expect(result).toEqual({ kind: "activated", sessionId: "cs_paid" });
    expect(activateUserFromCheckoutSession).toHaveBeenCalledWith(paidSession, {
      expectedClaimedAt: heldClaimedAt,
    });
  });

  it.each([404, 400, 403])(
    "Stripeが恒久的なエラー（%i）を返した場合は unrecoverable とし、運用者へ通知する",
    async (statusCode) => {
      vi.mocked(activateUserFromCheckoutSession).mockRejectedValue(stripeError(statusCode));

      const result = await recoverCompletedCheckout(5, [paidSession], heldClaimedAt);

      expect(result).toEqual({ kind: "unrecoverable" });
      expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledWith({
        userId: 5,
        reason: `Stripeが処理を拒否しました（${statusCode}）`,
        sessionIds: ["cs_paid"],
      });
    }
  );

  it.each([409, 429, 500])(
    "時間を置けば通りうるStripeのエラー（%i）は一時的な error とし、通知しない",
    async (statusCode) => {
      vi.mocked(activateUserFromCheckoutSession).mockRejectedValue(stripeError(statusCode));

      const result = await recoverCompletedCheckout(5, [paidSession], heldClaimedAt);

      expect(result).toEqual({ kind: "error" });
      expect(sendSlackCheckoutRecoveryNotification).not.toHaveBeenCalled();
    }
  );

  it("同じユーザー・セッションの自動復旧不可通知は、一定期間に1回だけ送る", async () => {
    vi.mocked(claimEvent)
      .mockResolvedValueOnce({
        claimed: true,
        processedAt: "2026-09-26T04:00:00.000Z",
        error: null,
      })
      .mockResolvedValue({ claimed: false, processedAt: null, error: null });
    const sessions = [paidSession, { ...(paidSession as object), id: "cs_paid_2" } as never];

    await recoverCompletedCheckout(5, sessions, heldClaimedAt);
    await recoverCompletedCheckout(5, sessions, heldClaimedAt);
    await recoverCompletedCheckout(5, sessions, heldClaimedAt);

    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledTimes(1);
    // Webhookのイベントidと衝突しないキーで、1時間に1回に抑止する
    expect(claimEvent).toHaveBeenCalledWith(
      "checkout_recovery_notice:5:cs_paid,cs_paid_2",
      "app.checkout_recovery_notice",
      60
    );
  });

  it.each([
    ["DBエラー", () => Promise.resolve({ claimed: false, processedAt: null, error: "db error" })],
    ["例外", () => Promise.reject(new Error("service role unavailable"))],
  ])("重複の判定に失敗した場合（%s）は、取りこぼさないよう通知する", async (_label, impl) => {
    vi.mocked(claimEvent).mockImplementation(impl as never);

    const result = await recoverCompletedCheckout(
      5,
      [{ ...(paidSession as object), subscription: null } as never],
      heldClaimedAt
    );

    expect(result).toEqual({ kind: "unrecoverable" });
    expect(sendSlackCheckoutRecoveryNotification).toHaveBeenCalledTimes(1);
  });
});

describe("reactivatePaidTrialUser", () => {
  it("再昇格できたかを返す", async () => {
    vi.mocked(reactivateUserFromMirror).mockResolvedValue({ error: null, activated: true });

    await expect(reactivatePaidTrialUser(5)).resolves.toBe(true);
    expect(reactivateUserFromMirror).toHaveBeenCalledWith(5);
  });

  it("エラー・例外は握りつぶして false を返す（呼び出し元は従来どおり409）", async () => {
    vi.mocked(reactivateUserFromMirror)
      .mockResolvedValueOnce({ error: "db error", activated: false })
      .mockRejectedValueOnce(new Error("stripe unavailable"));

    await expect(reactivatePaidTrialUser(5)).resolves.toBe(false);
    await expect(reactivatePaidTrialUser(5)).resolves.toBe(false);
  });
});
