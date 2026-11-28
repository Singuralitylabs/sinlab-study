import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISPLAY_MONTHLY_PRICE_JPY,
  DISPLAY_YEARLY_PRICE_JPY,
  formatPlanJpyPrice,
  isChargeableSubscriptionPrice,
  isSubscriptionPlan,
  logDisplayPriceDrift,
  planOfBillingInterval,
} from "@/app/constants/stripe";

describe("isChargeableSubscriptionPrice", () => {
  it("JPYの月額金額があるときだけtrue", () => {
    expect(isChargeableSubscriptionPrice({ amount: 1500, currency: "jpy" })).toBe(true);
    expect(isChargeableSubscriptionPrice({ amount: 1500, currency: "JPY" })).toBe(true);
  });

  it("非月額・非JPYはfalse", () => {
    expect(isChargeableSubscriptionPrice({ amount: null, currency: "jpy" })).toBe(false);
    expect(isChargeableSubscriptionPrice({ amount: 1500, currency: "usd" })).toBe(false);
  });
});

describe("logDisplayPriceDrift", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("法定表示フォールバックと一致する金額では警告しない", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logDisplayPriceDrift(DISPLAY_MONTHLY_PRICE_JPY);
    expect(error).not.toHaveBeenCalled();
  });

  it("乖離がある場合は警告する", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logDisplayPriceDrift(3000);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("年額プランの定数（#290）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("許可されたプランだけを受け付ける", () => {
    expect(isSubscriptionPlan("monthly")).toBe(true);
    expect(isSubscriptionPlan("yearly")).toBe(true);
    expect(isSubscriptionPlan("weekly")).toBe(false);
    expect(isSubscriptionPlan(undefined)).toBe(false);
  });

  it("ミラーの請求間隔からプランを引く（不明・未記録は null）", () => {
    expect(planOfBillingInterval("month")).toBe("monthly");
    expect(planOfBillingInterval("year")).toBe("yearly");
    expect(planOfBillingInterval("week")).toBeNull();
    expect(planOfBillingInterval(null)).toBeNull();
  });

  it("プランに合わせて月額・年額の表記にする", () => {
    expect(formatPlanJpyPrice("monthly", 1500)).toBe("月額1,500円（税込）");
    expect(formatPlanJpyPrice("yearly", 15000)).toBe("年額15,000円（税込）");
  });

  it("年額の乖離は年額の定数と比べる", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logDisplayPriceDrift(DISPLAY_YEARLY_PRICE_JPY, "yearly");
    expect(error).not.toHaveBeenCalled();
    logDisplayPriceDrift(DISPLAY_MONTHLY_PRICE_JPY, "yearly");
    expect(error).toHaveBeenCalledOnce();
  });
});
