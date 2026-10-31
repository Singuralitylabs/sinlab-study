import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/learning-server")>()),
  fetchThemeById: vi.fn(),
  fetchPhaseById: vi.fn(),
  fetchPhasesByThemeId: vi.fn(),
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
  fetchPhasesByThemeId,
  fetchThemeById,
  fetchUserProgressByContentIds,
} from "@/app/services/api/learning-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const defaultPhases = [
  { id: 1, name: "フェーズ1", display_order: 1, is_published: true },
  { id: 2, name: "フェーズ2", display_order: 2, is_published: true },
  { id: 3, name: "フェーズ3", display_order: 3, is_published: true },
];

const setup = (
  userStatus: "trial" | "active",
  options?: {
    phaseId?: number;
    phases?: typeof defaultPhases;
    userRole?: "member" | "admin" | "maintainer";
  }
) => {
  const phaseId = options?.phaseId ?? 2;
  const phases = options?.phases ?? defaultPhases;
  const userRole = options?.userRole ?? "member";
  const current = phases.find((p) => p.id === phaseId) ?? phases[0];

  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchThemeById).mockResolvedValue({
    data: { id: 1, name: "テーマ", is_published: true },
    error: null,
  } as never);
  vi.mocked(fetchPhaseById).mockResolvedValue({
    data: {
      id: current.id,
      theme_id: 1,
      name: current.name,
      description: null,
      is_published: current.is_published,
      display_order: current.display_order,
    },
    error: null,
  } as never);
  vi.mocked(fetchPhasesByThemeId).mockResolvedValue({
    data: phases,
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

const render = async (phaseId = "2") =>
  renderToStaticMarkup(await PhasePage({ params: Promise.resolve({ themeId: "1", phaseId }) }));

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

describe("フェーズ前後ナビ（#457）", () => {
  it("中間フェーズでは前・次へのリンクを出す", async () => {
    setup("active", { phaseId: 2 });
    const html = await render("2");

    expect(html).toContain("前のフェーズ");
    expect(html).toContain('href="/learn/1/1"');
    expect(html).toContain("次のフェーズ");
    expect(html).toContain('href="/learn/1/3"');
    expect(html).not.toContain("テーマに戻る");
    expect(html).toContain("min-w-0");
  });

  it("先頭では前を出さず、末尾では次の代わりにテーマへ戻る", async () => {
    setup("active", { phaseId: 1 });
    const first = await render("1");
    expect(first).not.toContain("前のフェーズ");
    expect(first).toContain("次のフェーズ");
    expect(first).toContain('href="/learn/1/2"');
    expect(first).not.toContain("テーマに戻る");

    setup("active", { phaseId: 3 });
    const last = await render("3");
    expect(last).toContain("前のフェーズ");
    expect(last).toContain('href="/learn/1/2"');
    expect(last).not.toContain("次のフェーズ");
    expect(last).toContain("テーマに戻る");
    expect(last).toContain('href="/learn/1"');
  });

  it("member には未公開フェーズが前後の対象に出ない（取得結果に合わせる）", async () => {
    // fetchPhasesByThemeId already filters unpublished for member; simulate that list.
    setup("active", {
      phaseId: 1,
      phases: [
        { id: 1, name: "公開A", display_order: 1, is_published: true },
        { id: 3, name: "公開B", display_order: 3, is_published: true },
      ],
    });
    const html = await render("1");

    expect(fetchPhasesByThemeId).toHaveBeenCalledWith(1, "member");
    expect(html).toContain('href="/learn/1/3"');
    expect(html).not.toContain('href="/learn/1/2"');
  });
});
