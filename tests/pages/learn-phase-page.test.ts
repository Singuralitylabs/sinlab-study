import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/learning-server")>()),
  fetchThemeById: vi.fn(),
  fetchPhaseById: vi.fn(),
  fetchContentSummariesByPhaseId: vi.fn(),
  fetchUserProgressByContentIds: vi.fn(),
}));
vi.mock("@/app/services/api/ai-review-server", () => ({
  fetchCompletedAIReviewContentIds: vi.fn().mockResolvedValue({ data: new Set<number>() }),
}));
vi.mock("@/app/services/api/upgrade-price-server", () => ({
  fetchUpgradePriceLabel: vi.fn(),
}));

import PhasePage from "@/app/(authenticated)/learn/[themeId]/[phaseId]/page";
import {
  fetchContentSummariesByPhaseId,
  fetchPhaseById,
  fetchThemeById,
  fetchUserProgressByContentIds,
} from "@/app/services/api/learning-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const setup = (userStatus: "trial" | "active") => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole: "member",
  } as never);
  vi.mocked(fetchThemeById).mockResolvedValue({
    data: { id: 1, name: "テーマ", is_published: true },
    error: null,
  } as never);
  vi.mocked(fetchPhaseById).mockResolvedValue({
    data: { id: 2, theme_id: 1, name: "フェーズ", description: null, is_published: true },
    error: null,
  } as never);
  vi.mocked(fetchContentSummariesByPhaseId).mockResolvedValue({
    data: [
      {
        id: 10,
        title: "公開",
        content_type: "text",
        is_open_to_trial: true,
        is_published: true,
      },
      {
        id: 11,
        title: "有料のみ",
        content_type: "text",
        is_open_to_trial: false,
        is_published: true,
      },
    ],
    error: null,
  } as never);
  vi.mocked(fetchUserProgressByContentIds).mockResolvedValue({
    data: new Map<number, boolean>(),
  } as never);
};

const render = async () =>
  renderToStaticMarkup(
    await PhasePage({ params: Promise.resolve({ themeId: "1", phaseId: "2" }) })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchUpgradePriceLabel).mockResolvedValue("月額1,500円（税込）");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("フェーズ一覧のアップグレード導線（#325）", () => {
  it("Stripe有効: お試しユーザーに料金ラベル付きの CTA を表示する", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup("trial");

    const html = await render();

    expect(html).toContain("月額1,500円（税込）");
    expect(html).toContain('href="/upgrade"');
  });

  it("Stripe無効: 料金を取得せず /upgrade への導線を出さない", async () => {
    vi.stubEnv("STRIPE_ENABLED", "false");
    setup("trial");

    const html = await render();

    expect(fetchUpgradePriceLabel).not.toHaveBeenCalled();
    expect(html).not.toContain('href="/upgrade"');
  });

  it("active には CTA を出さず料金も取得しない", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup("active");

    const html = await render();

    expect(fetchUpgradePriceLabel).not.toHaveBeenCalled();
    expect(html).not.toContain('href="/upgrade"');
  });
});

describe("フェーズ完了バナーのマスコット", () => {
  it("テーマ名に関係なく、完了でシンラビを表示する", async () => {
    setup("active");
    vi.mocked(fetchUserProgressByContentIds).mockResolvedValue({
      data: new Map([
        [10, true],
        [11, true],
      ]),
    } as never);

    const html = await render();

    expect(html).toContain("お疲れさまでした");
    expect(html).toContain("応援するシンラビ");
  });
});
