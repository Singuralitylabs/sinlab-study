import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/stripe-server", () => ({ fetchSubscriptionPrice: vi.fn() }));

import { fetchSubscriptionPrice } from "@/app/services/api/stripe-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";

describe("fetchUpgradePriceLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("取得できた実額を返す", async () => {
    vi.mocked(fetchSubscriptionPrice).mockResolvedValue({ amount: 3000, currency: "jpy" });
    expect(await fetchUpgradePriceLabel()).toBe("月額3,000円（税込）");
  });

  it("取得に失敗したら DISPLAY_MONTHLY_PRICE_JPY にフォールバックする", async () => {
    vi.mocked(fetchSubscriptionPrice).mockRejectedValue(new Error("stripe down"));
    expect(await fetchUpgradePriceLabel()).toBe("月額1,500円（税込）");
  });

  it("Stripe が応答しなくてもタイムアウトでフォールバックし、ページを止めない", async () => {
    vi.mocked(fetchSubscriptionPrice).mockReturnValue(new Promise(() => undefined));

    const result = fetchUpgradePriceLabel();
    await vi.advanceTimersByTimeAsync(2000);

    expect(await result).toBe("月額1,500円（税込）");
  });
});
