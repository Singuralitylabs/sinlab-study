import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const { mockSessionsCreate, mockPricesRetrieve, MockStripeError } = vi.hoisted(() => {
  class MockStripeError extends Error {
    code?: string;
    param?: string;
    constructor(opts: { message: string; code?: string; param?: string }) {
      super(opts.message);
      this.code = opts.code;
      this.param = opts.param;
    }
  }
  return { mockSessionsCreate: vi.fn(), mockPricesRetrieve: vi.fn(), MockStripeError };
});

vi.mock("stripe", () => {
  class MockStripe {
    checkout = { sessions: { create: mockSessionsCreate } };
    prices = { retrieve: mockPricesRetrieve };
  }
  return { default: Object.assign(MockStripe, { errors: { StripeError: MockStripeError } }) };
});

vi.mock("@/app/services/api/supabase-server");

import {
  createCheckoutSession,
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
  isProrationBelowMinimum,
} from "@/app/services/api/stripe-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

// Priceのモジュールスコープキャッシュ（5分TTL）がテスト間で残らないよう、
// テストごとに実時刻をTTLより大きい10分ずつ進める。テストが明示的に渡す
// `now`（アンカー判定用の日時）はDate.now()を使わない実時刻指定のため影響を受けない
let fakeNowMs = new Date("2099-01-01T00:00:00.000Z").getTime();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fakeNowMs += 10 * 60 * 1000;
  vi.setSystemTime(fakeNowMs);
});

afterEach(() => {
  vi.useRealTimers();
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
  // 月中の登録を想定した固定時刻（アンカーまで十分な余裕があり、日割り額が最低請求額を
  // 下回らないケース）。個別テストで境界値を検証する際は上書きする
  const midMonth = new Date("2026-08-10T00:00:00.000Z");

  beforeEach(() => {
    mockSessionsCreate.mockReset();
    mockPricesRetrieve.mockReset();
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "jpy",
      recurring: { interval: "month", interval_count: 1 },
    });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("既存Customer IDがある場合はcustomerとして渡し、customer_emailは渡さない", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    const result = await createCheckoutSession(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_existing",
      midMonth
    );

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing");
    expect(params).not.toHaveProperty("customer_email");
  });

  it("billing_cycle_anchor_configを定数どおりに渡す", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.billing_cycle_anchor_config).toEqual({
      day_of_month: 27,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("日割り額が最低請求額以上のときはproration_behaviorがcreate_prorationsになる", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("create_prorations");
  });

  it("アンカー直前（日割り額が最低請求額を下回る）の登録はproration_behaviorがnoneになる", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    // 27日 0:00 UTC の30分前 = 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const justBeforeAnchor = new Date("2026-08-26T23:30:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, justBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("none");
  });

  it("既存Customer IDが無い場合はcustomer_emailを渡す", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, midMonth);

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

    const result = await createCheckoutSession(
      5,
      "auth-uuid",
      "trial@example.com",
      "cus_deleted",
      midMonth
    );

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
      createCheckoutSession(5, "auth-uuid", "trial@example.com", "cus_existing", midMonth)
    ).rejects.toThrow("No such price");
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("isProrationBelowMinimum", () => {
  beforeEach(() => {
    mockPricesRetrieve.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("月中の登録では最低請求額を下回らない", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "jpy",
      recurring: { interval: "month", interval_count: 1 },
    });

    const result = await isProrationBelowMinimum(new Date("2026-08-10T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("アンカー30分前の登録は最低請求額を下回る（境界値: 下回る側）", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "jpy",
      recurring: { interval: "month", interval_count: 1 },
    });

    // 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(true);
  });

  it("アンカー24時間前の登録は最低請求額を下回らない（境界値: 下回らない側）", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "jpy",
      recurring: { interval: "month", interval_count: 1 },
    });

    // 月額3000円換算（7月分の周期は31日）で日割り額は約97円（¥50以上）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("JPY以外の通貨の場合は判定できないためfalseを返す", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
    });

    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(false);
  });
});

describe("fetchSubscriptionPrice", () => {
  beforeEach(() => {
    mockPricesRetrieve.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_dummy");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("月額(1ヶ月間隔)のPriceは金額を返す", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 3000,
      currency: "jpy",
      recurring: { interval: "month", interval_count: 1 },
    });

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: 3000, currency: "jpy" });
  });

  it("月額以外の間隔のPriceはamount: nullを返す", async () => {
    mockPricesRetrieve.mockResolvedValue({
      unit_amount: 30000,
      currency: "jpy",
      recurring: { interval: "year", interval_count: 1 },
    });

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: null, currency: "jpy" });
  });
});
