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
  isStripeEnabled,
} from "@/app/services/api/stripe-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

/** `stripe.prices.retrieve()` のモック応答を設定する共通ヘルパー（既定値: 月額¥3000） */
function mockPrice(
  overrides: {
    unitAmount?: number | null;
    currency?: string;
    interval?: string;
    intervalCount?: number;
  } = {}
) {
  const { unitAmount = 3000, currency = "jpy", interval = "month", intervalCount = 1 } = overrides;
  mockPricesRetrieve.mockResolvedValue({
    unit_amount: unitAmount,
    currency,
    recurring: { interval, interval_count: intervalCount },
  });
}

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
    mockPrice();
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

  it("proration_behaviorがcreate_prorationsのときはexpires_atを指定しない", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, midMonth);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params).not.toHaveProperty("expires_at");
  });

  it("proration_behaviorがnoneのとき、expires_atをアンカー時刻付近にクランプする（TOCTOU対策）", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    // アンカー30分前。Stripeの最低セッション有効期間（30分）と安全マージン（2分）の
    // 合計がアンカーまでの残り時間を上回るため、expires_atはnow+32分側が採用される
    const justBeforeAnchor = new Date("2026-08-26T23:30:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, justBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.expires_at).toBe(
      Math.floor(new Date("2026-08-27T00:02:00.000Z").getTime() / 1000)
    );
  });

  it("アンカーまで30分未満のときは、expires_atをStripeの最低許容値＋安全マージンにクランプする", async () => {
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    // アンカー10分前。アンカー時刻をそのまま使うとStripeの最低30分要件に違反するため、
    // now + 32分（30分＋安全マージン2分）を使う（結果としてアンカーを22分ほど超える
    // 余地が残るが、この時間帯自体が既に「日割り額¥50未満」というごく狭い範囲の
    // 中のさらに一部でしかない）
    const tenMinutesBeforeAnchor = new Date("2026-08-26T23:50:00.000Z");

    await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, tenMinutesBeforeAnchor);

    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.expires_at).toBe(
      Math.floor(new Date("2026-08-27T00:22:00.000Z").getTime() / 1000)
    );
  });

  it("Price取得に失敗した場合はcreate_prorationsにフォールバックし、Checkout作成自体は継続する", async () => {
    mockPricesRetrieve.mockReset();
    mockPricesRetrieve.mockRejectedValue(new Error("Stripe API一時エラー"));
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });

    const result = await createCheckoutSession(5, "auth-uuid", "trial@example.com", null, midMonth);

    expect(result).toEqual({ url: "https://checkout.stripe.com/xxx" });
    const params = mockSessionsCreate.mock.calls[0][0];
    expect(params.subscription_data.proration_behavior).toBe("create_prorations");
    expect(params).not.toHaveProperty("expires_at");
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
    mockPrice();

    const result = await isProrationBelowMinimum(new Date("2026-08-10T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("アンカー30分前の登録は最低請求額を下回る（遠く下回る側のサニティチェック）", async () => {
    mockPrice();

    // 月額3000円換算（7月分の周期は31日）で日割り額は約2円（¥50未満）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(true);
  });

  it("アンカー24時間前の登録は最低請求額を下回らない（遠く下回らない側のサニティチェック）", async () => {
    mockPrice();

    // 月額3000円換算（7月分の周期は31日）で日割り額は約97円（¥50以上）
    const result = await isProrationBelowMinimum(new Date("2026-08-26T00:00:00.000Z"));

    expect(result).toBe(false);
  });

  it("日割り額がちょうど49円のとき（¥50未満の境界）はtrueを返す", async () => {
    mockPrice();

    // 7月分の周期(31日=2,678,400,000ms)に対し、remainingMs = 49 * 892,800 = 43,747,200ms
    // ちょうど日割り額49円（Math.round(49) = 49 < 50）になる時刻
    const result = await isProrationBelowMinimum(new Date("2026-08-26T11:50:52.800Z"));

    expect(result).toBe(true);
  });

  it("日割り額がちょうど50円のとき（¥50ちょうどの境界）はfalseを返す", async () => {
    mockPrice();

    // remainingMs = 50 * 892,800 = 44,640,000ms（=12時間24分）
    // ちょうど日割り額50円（Math.round(50) = 50。厳密な不等号 `< 50` によりfalse）になる時刻
    const result = await isProrationBelowMinimum(new Date("2026-08-26T11:36:00.000Z"));

    expect(result).toBe(false);
  });

  it("JPY以外の通貨の場合は判定できないためfalseを返す", async () => {
    mockPrice({ currency: "usd" });

    const result = await isProrationBelowMinimum(new Date("2026-08-26T23:30:00.000Z"));

    expect(result).toBe(false);
  });

  it("1ヶ月間隔でないPrice（誤設定）の場合は判定できないためfalseを返す", async () => {
    mockPrice({ unitAmount: 30000, interval: "year" });

    // 年額換算なら本来ごく僅かな日割り額になるはずの時刻だが、月次前提が崩れるため
    // 判定自体を行わずfalseを返す
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
    mockPrice();

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: 3000, currency: "jpy" });
  });

  it("月額以外の間隔のPriceはamount: nullを返す", async () => {
    mockPrice({ unitAmount: 30000, interval: "year" });

    const result = await fetchSubscriptionPrice();

    expect(result).toEqual({ amount: null, currency: "jpy" });
  });
});

describe("isStripeEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("STRIPE_ENABLEDが'true'の場合はtrueを返す", () => {
    vi.stubEnv("STRIPE_ENABLED", "true");

    expect(isStripeEnabled()).toBe(true);
  });

  it.each([
    undefined,
    "false",
    "1",
    "TRUE",
    "",
  ])("STRIPE_ENABLEDが%s（'true'以外）の場合はfalseを返す（フェイルクローズ）", (value) => {
    if (value !== undefined) {
      vi.stubEnv("STRIPE_ENABLED", value);
    }

    expect(isStripeEnabled()).toBe(false);
  });
});
