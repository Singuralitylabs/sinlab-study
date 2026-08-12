import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-webhook-server");

import { POST } from "@/app/api/stripe/webhook/route";
import { claimEvent } from "@/app/services/api/stripe-webhook-server";

const webhookSecret = "whsec_test_dummy_secret";

const request = (rawBody: string, signature: string | null) =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: rawBody,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-dummy");
  vi.mocked(claimEvent).mockResolvedValue({ claimed: false, processedAt: null, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/webhook - 署名検証", () => {
  it("正しい署名のリクエストは受理される", async () => {
    const payload = JSON.stringify({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

    const res = await POST(request(payload, header) as never);

    expect(res.status).toBe(200);
  });

  it("署名が不正な場合は400を返し、以降の処理を行わない", async () => {
    const payload = JSON.stringify({ id: "evt_test_2", type: "checkout.session.completed" });

    const res = await POST(request(payload, "t=1,v1=invalid-signature") as never);

    expect(res.status).toBe(400);
    expect(claimEvent).not.toHaveBeenCalled();
  });

  it("別のシークレットで署名された場合は400を返す", async () => {
    const payload = JSON.stringify({ id: "evt_test_3", type: "checkout.session.completed" });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_wrong_secret",
    });

    const res = await POST(request(payload, header) as never);

    expect(res.status).toBe(400);
  });

  it("署名ヘッダが無い場合は400を返す", async () => {
    const payload = JSON.stringify({ id: "evt_test_4", type: "checkout.session.completed" });

    const res = await POST(request(payload, null) as never);

    expect(res.status).toBe(400);
    expect(claimEvent).not.toHaveBeenCalled();
  });
});
