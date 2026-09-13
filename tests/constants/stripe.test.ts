import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISPLAY_MONTHLY_PRICE_JPY,
  isChargeableSubscriptionPrice,
  logDisplayPriceDrift,
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
