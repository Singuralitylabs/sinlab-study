import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /upgrade の契約中表示（次回のお支払い日・解約予定日）をページ単位で検証する。
// データ取得はモックし、クライアントのボタンは最小表示に差し替える。

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  fetchStripeSubscriptionByUserId: vi.fn(),
  fetchSubscriptionPrice: vi.fn(),
}));
vi.mock("@/app/(authenticated)/upgrade/ManageSubscriptionButton", () => ({
  ManageSubscriptionButton: () => createElement("div", null, "manage"),
}));
vi.mock("@/app/(authenticated)/upgrade/UpgradeCheckoutButton", () => ({
  UpgradeCheckoutButton: () => createElement("div", null, "checkout"),
}));

import UpgradePage from "@/app/(authenticated)/upgrade/page";
import { fetchStripeSubscriptionByUserId } from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

// 2026-10-26T15:00:00Z は JST で 2026/10/27
const PERIOD_END = "2026-10-26T15:00:00.000Z";

const renderWithSubscription = async (
  overrides: Partial<{
    status: string;
    cancel_at_period_end: boolean;
    cancel_at: string | null;
    current_period_end: string | null;
  }>
) => {
  vi.mocked(fetchStripeSubscriptionByUserId).mockResolvedValue({
    data: {
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      current_period_end: PERIOD_END,
      ...overrides,
    },
    error: null,
  });
  return renderToStaticMarkup(await UpgradePage());
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_ENABLED", "true");
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus: "active",
    userRole: "member",
  } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/upgrade の契約中表示", () => {
  it("解約予約が無ければ次回のお支払い日を表示する", async () => {
    const html = await renderWithSubscription({});

    expect(html).toContain("ご契約中です（次回のお支払い: 2026/10/27）");
    expect(html).not.toContain("解約予定");
  });

  it("cancel_at_period_end の解約予約は、期間末の日付で解約予定を表示する", async () => {
    const html = await renderWithSubscription({ cancel_at_period_end: true });

    expect(html).toContain("ご契約中です（2026/10/27をもって解約予定です）");
  });

  it("flexible billing mode の Portal 解約（cancel_at のみ設定）も、cancel_at の日付で解約予定を表示する", async () => {
    const html = await renderWithSubscription({ cancel_at: "2026-10-19T15:00:00.000Z" });

    expect(html).toContain("ご契約中です（2026/10/20をもって解約予定です）");
    expect(html).not.toContain("次回のお支払い");
  });

  it("解約済み（終端状態）の行は契約中として扱わない", async () => {
    const html = await renderWithSubscription({ status: "canceled" });

    expect(html).not.toContain("ご契約中です");
  });
});
