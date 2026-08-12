import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const { mockSessionsCreate, MockStripeError } = vi.hoisted(() => {
  class MockStripeError extends Error {
    code?: string;
    param?: string;
    constructor(opts: { message: string; code?: string; param?: string }) {
      super(opts.message);
      this.code = opts.code;
      this.param = opts.param;
    }
  }
  return { mockSessionsCreate: vi.fn(), MockStripeError };
});

vi.mock("stripe", () => {
  class MockStripe {
    checkout = { sessions: { create: mockSessionsCreate } };
  }
  return { default: Object.assign(MockStripe, { errors: { StripeError: MockStripeError } }) };
});

vi.mock("@/app/services/api/supabase-server");

import {
  createCheckoutSession,
  fetchStripeSubscriptionByUserId,
} from "@/app/services/api/stripe-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchStripeSubscriptionByUserId", () => {
  it("サブスクリプション情報を返す", async () => {
    const row = {
      status: "active",
      cancel_at_period_end: false,
      current_period_end: "2026-09-01T00:00:00+00:00",
    };
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: row, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toEqual(row);
    expect(result.error).toBeNull();
  });

  it("サブスクリプションが無い場合はnullを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it("DBエラー時はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchStripeSubscriptionByUserId(5);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("createCheckoutSession", () => {
  beforeEach(() => {
    mockSessionsCreate.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("既存Customer IDがある場合はcustomerとして渡し、customer_emailは渡さない", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    const result = await createCheckoutSession(5, "auth-uuid", "trial@example.com", "cus_existing");

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing");
    expect(params).not.toHaveProperty("customer_email");
  });

  it("既存Customer IDが無い場合はcustomer_emailを渡す", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer_email).toBe("trial@example.com");
    expect(params).not.toHaveProperty("customer");
  });

  it("保存済みCustomerがStripe側に存在しない場合は新規Customerでフォールバックする", async () => {
    mockSessionsCreate
      .mockRejectedValueOnce(
        new MockStripeError({
          message: "No such customer",
          code: "resource_missing",
          param: "customer",
        })
      )
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/fallback" });

    const result = await createCheckoutSession(5, "auth-uuid", "trial@example.com", "cus_deleted");

    expect(result).toEqual({ url: "https://checkout.stripe.com/fallback" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
    const fallbackParams = mockSessionsCreate.mock.calls[1][0];
    expect(fallbackParams.customer_email).toBe("trial@example.com");
    expect(fallbackParams).not.toHaveProperty("customer");
  });

  it("Customer以外のresource_missingエラーはフォールバックせずthrowする", async () => {
    mockSessionsCreate.mockRejectedValue(
      new MockStripeError({ message: "No such price", code: "resource_missing", param: "price" })
    );

    await expect(
      createCheckoutSession(5, "auth-uuid", "trial@example.com", "cus_existing")
    ).rejects.toThrow("No such price");
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });
});
