import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/app/(authenticated)/upgrade/PlanInquiryButton", () => ({
  PlanInquiryButton: ({ compact }: { compact?: boolean }) =>
    createElement("div", null, compact ? "inquiry-compact" : "inquiry"),
}));

import UpgradePage from "@/app/(authenticated)/upgrade/page";
import {
  fetchStripeSubscriptionByUserId,
  fetchSubscriptionPrice,
} from "@/app/services/api/stripe-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

// 2026-10-26T15:00:00Z is 2026/10/27 in JST.
const PERIOD_END = "2026-10-26T15:00:00.000Z";

const renderWithSubscription = async (
  overrides: Partial<{
    status: string;
    cancel_at_period_end: boolean;
    cancel_at: string | null;
    current_period_end: string | null;
    billing_interval: string | null;
  }>
) => {
  vi.mocked(fetchStripeSubscriptionByUserId).mockResolvedValue({
    data: {
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      current_period_end: PERIOD_END,
      billing_interval: null,
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

describe("/upgrade のプランカード", () => {
  it("お試し会員はカードだけを出し、価格未確認時は「—」にする", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "trial",
      userRole: "member",
      membershipType: null,
    } as never);
    vi.mocked(fetchSubscriptionPrice).mockResolvedValue({
      amount: null,
      currency: "jpy",
    });

    const html = renderToStaticMarkup(await UpgradePage());

    expect(html).toContain("一般有料会員");
    expect(html).toContain("コミュニティ会員");
    expect(html).toContain("—");
    expect(html).toContain("一般有料会員の詳細を開く");
    expect(html).toContain("コミュニティ会員の詳細を開く");
    expect(html).not.toContain("詳細を見る");
    expect(html).toContain("Slackでのコミュニケーション");
    expect(html).toContain("Web/AIの最新情報");
    // Checkout / legal copy live in the dialog (client); not asserted on the server HTML.
  });

  it("一般有料会員は現在のプランバッジと解約入口をカード上に出し、一般カードはモーダルにしない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "active",
      userRole: "member",
      membershipType: "general",
    } as never);

    const html = await renderWithSubscription({});

    expect(html).toContain("現在のプラン");
    expect(html).toContain("ご契約中です（次回のお支払い: 2026/10/27）");
    expect(html).toContain("manage");
    expect(html).not.toContain("一般有料会員の詳細を開く");
    expect(html).toContain("コミュニティ会員の詳細を開く");
    expect(html).toContain("Slackでのコミュニケーション");
  });
});

describe("/upgrade の年額プラン（#290）", () => {
  const trialAuth = {
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus: "trial",
    userRole: "member",
    membershipType: null,
  };

  function mockPrices(yearly: { amount: number | null; currency: string } | Error) {
    vi.mocked(fetchSubscriptionPrice).mockImplementation(async (plan) => {
      if (plan === "yearly") {
        if (yearly instanceof Error) {
          throw yearly;
        }
        return yearly;
      }
      return { amount: 1500, currency: "jpy" };
    });
  }

  beforeEach(() => {
    vi.mocked(getServerAuth).mockResolvedValue(trialAuth as never);
    vi.stubEnv("STRIPE_PRICE_ID", "price_monthly");
    vi.stubEnv("STRIPE_PRICE_ID_YEARLY", "price_yearly");
  });

  it("年額の Price を確認できれば、カードに月額と年額を並べる", async () => {
    mockPrices({ amount: 15000, currency: "jpy" });

    const html = renderToStaticMarkup(await UpgradePage());

    expect(html).toContain("月額1,500円（税込） / 年額15,000円（税込）");
    expect(fetchSubscriptionPrice).toHaveBeenCalledWith("yearly");
  });

  it.each([
    ["年額でない Price", { amount: null, currency: "jpy" }],
    ["取得の失敗", new Error("stripe down")],
  ])("年額が %s なら年額を出さない（フェイルクローズ）", async (_label, yearly) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockPrices(yearly);

    const html = renderToStaticMarkup(await UpgradePage());

    expect(html).toContain("月額1,500円（税込）");
    expect(html).not.toContain("年額");
  });

  it("STRIPE_PRICE_ID_YEARLY が未設定なら年額の料金を取りに行かない", async () => {
    vi.stubEnv("STRIPE_PRICE_ID_YEARLY", "");
    mockPrices({ amount: 15000, currency: "jpy" });

    const html = renderToStaticMarkup(await UpgradePage());

    expect(html).not.toContain("年額");
    expect(fetchSubscriptionPrice).not.toHaveBeenCalledWith("yearly");
  });

  it("年額の契約中は、契約中表示にプラン種別を出す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "active",
      userRole: "member",
      membershipType: "general",
    } as never);

    const html = await renderWithSubscription({ billing_interval: "year" });

    expect(html).toContain("ご契約中です（年額プラン、次回のお支払い: 2026/10/27）");
  });
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
