import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/onboarding-server");
vi.mock("@/app/services/api/announcements-server");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/services/api/upgrade-price-server", () => ({
  fetchUpgradePriceLabel: vi.fn().mockResolvedValue("月額1,500円（税込）"),
}));
vi.mock("@/app/(authenticated)/components/WelcomeDialog", () => ({
  WelcomeDialog: () => createElement("div"),
}));
vi.mock("@/app/(authenticated)/components/GettingStartedChecklist", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/app/(authenticated)/components/GettingStartedChecklist")
    >();
  return { ...actual, GettingStartedChecklist: () => null };
});

import HomePage from "@/app/(authenticated)/page";
import { getViewerAnnouncements } from "@/app/services/api/announcements-server";
import { fetchRecentCertificate } from "@/app/services/api/certificates-server";
import {
  fetchContinueLearningInputs,
  fetchThemeProgressSummaries,
} from "@/app/services/api/learning-server";
import {
  fetchGettingStartedProgress,
  fetchOnboardingStatus,
} from "@/app/services/api/onboarding-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const summary = (id: number, name: string, completedContents: number, totalContents: number) => ({
  theme: { id, name, description: null, image_url: null },
  totalContents,
  completedContents,
});

const setup = (
  summaries: ReturnType<typeof summary>[],
  {
    userStatus = "active",
    userRole = "member",
    continueLearning = {
      orderedContents: [
        {
          id: 101,
          title: "最初のコンテンツ",
          contentType: "text" as const,
          themeId: 1,
          themeName: "GAS学習",
          phaseId: 1,
          weekId: 1,
        },
      ],
      completedContentIds: new Set<number>(),
      completedAtByContentId: new Map<number, number>(),
    },
  } = {}
) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
    data: summaries,
    error: null,
  } as never);
  vi.mocked(fetchContinueLearningInputs).mockResolvedValue({
    data: continueLearning,
    error: null,
  } as never);
  vi.mocked(fetchOnboardingStatus).mockResolvedValue({
    data: { completedAt: "2026-10-01T00:00:00Z" },
    error: null,
  } as never);
  vi.mocked(fetchGettingStartedProgress).mockResolvedValue({
    data: { hasSubmission: true, hasCompletedReview: true },
    error: null,
  } as never);
  vi.mocked(getViewerAnnouncements).mockResolvedValue({ data: [], error: null });
  vi.mocked(fetchRecentCertificate).mockResolvedValue(null);
};

const render = async () => renderToStaticMarkup(await HomePage());

const GAS = (completed: number) => summary(1, "GAS学習", completed, 4);
const WEB = (completed: number) => summary(2, "Web開発", completed, 5);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ホームのテーマ別進捗（#370）", () => {
  it("見出しが「ホーム」で、学習進捗カードと修了・未着手一覧を出さない", async () => {
    setup([GAS(2), WEB(1)]);

    const html = await render();

    expect(html).toContain(">ホーム<");
    expect(html).not.toContain("ダッシュボード");
    expect(html).not.toContain("学習進捗");
    expect(html).not.toContain(">修了<");
    expect(html).not.toContain(">未着手<");
    expect(html).not.toContain("学習を始める");
    expect(html).toContain("学習中のテーマ");
    expect(html).toContain("続きから学習");
    expect(html).toContain("最初のコンテンツ");
  });

  it("全体進捗率（合算の「N / M コンテンツ完了」）を表示しない", async () => {
    setup([GAS(2), WEB(1)]);

    const html = await render();

    expect(html).not.toContain("3 / 9 コンテンツ完了");
  });

  it("0件完了: 学習中が無く、最初の未着手テーマへのリンクを出す", async () => {
    setup([GAS(0), WEB(0)]);

    const html = await render();

    expect(html).toContain("最初のテーマを始めましょう");
    expect(html).toContain('href="/learn/1"');
    expect(html).not.toContain(">学習中<");
    expect(html).not.toContain(">修了<");
  });

  it("1テーマ学習中: そのテーマの進捗を出し、続きから学習カードがある", async () => {
    setup([GAS(0), WEB(2)]);

    const html = await render();

    expect(html).not.toContain("最初のテーマを始めましょう");
    expect(html).toContain("学習中のテーマ");
    expect(html).toContain("2 / 5");
    expect(html).toContain("続きから学習");
  });

  it("2テーマ学習中: 完了率の高い順に並べる", async () => {
    setup([GAS(1), WEB(4)]);

    const html = await render();

    expect(html).toContain("1 / 4");
    expect(html).toContain("4 / 5");
    expect(html.indexOf("4 / 5")).toBeLessThan(html.indexOf("1 / 4"));
  });

  it("お試しの「次のステップ」カードの条件（全テーマの分母で100%）は変わらない", async () => {
    setup([summary(1, "GAS学習", 2, 2), summary(2, "Web開発", 1, 3)], { userStatus: "trial" });
    expect(await render()).not.toContain("次のステップ");

    setup([summary(1, "GAS学習", 2, 2), summary(2, "Web開発", 3, 3)], { userStatus: "trial" });
    const html = await render();
    expect(html).toContain("次のステップ");
    expect(html).not.toContain("続きから学習");
  });

  it("コンテンツが0件のテーマには誘導せず、次の未着手テーマを案内する", async () => {
    setup([summary(1, "空のテーマ", 0, 0), WEB(0)]);

    const html = await render();

    expect(html).toContain("最初のテーマを始めましょう");
    expect(html).toContain('href="/learn/2"');
    expect(html).toContain("（Web開発）");
    expect(html).not.toContain("（空のテーマ）");
  });

  it("修了済みのテーマがあるときは「次のテーマ」と案内する", async () => {
    setup([GAS(4), WEB(0)]);

    const html = await render();

    expect(html).toContain("次のテーマを始めましょう");
    expect(html).not.toContain("最初のテーマを始めましょう");
  });

  it("テーマが無いときは未登録の案内を出す", async () => {
    setup([], {
      continueLearning: {
        orderedContents: [],
        completedContentIds: new Set(),
        completedAtByContentId: new Map(),
      },
    });

    const html = await render();

    expect(html).toContain("学習コンテンツはまだ登録されていません");
    expect(html).not.toContain("続きから学習");
  });

  it("クイックリンクに学習・お知らせを出し、計測イベント値 dashboard_card は変えない", async () => {
    setup([summary(1, "GAS学習", 2, 2)], { userStatus: "trial" });

    const html = await render();

    expect(html).toContain('href="/learn"');
    expect(html).toContain("学習コンテンツ");
    expect(html).toContain('href="/announcements"');
    // Stripe is enabled in test env via constants; upgrade link may appear.
    // CTA source constant is not rendered as text; next-step card still uses UpgradeCta.
    expect(html).toContain("次のステップ");
  });
});
