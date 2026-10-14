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
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
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
  { userStatus = "active", userRole = "member" } = {}
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

describe("ダッシュボードのテーマ別進捗（#308）", () => {
  it("全体進捗率（合算の「N / M コンテンツ完了」）を表示しない", async () => {
    setup([GAS(2), WEB(1)]);

    const html = await render();

    expect(html).not.toContain("3 / 9 コンテンツ完了");
    expect(html).toContain("2 / 4 コンテンツ完了");
    expect(html).toContain("1 / 5 コンテンツ完了");
  });

  it("0件完了: 学習中が無く、最初の未着手テーマへのリンクと「未着手」だけの一覧", async () => {
    setup([GAS(0), WEB(0)]);

    const html = await render();

    expect(html).toContain("最初のテーマを始めましょう");
    expect(html).toContain('href="/learn/1"');
    expect(html).toContain("未着手");
    expect(html).not.toContain(">学習中<");
    expect(html).not.toContain(">修了<");
  });

  it("1テーマ学習中: そのテーマの進捗バーを出し、もう一方は未着手に入る", async () => {
    setup([GAS(0), WEB(2)]);

    const html = await render();

    expect(html).not.toContain("最初のテーマを始めましょう");
    expect(html).toContain(">学習中<");
    expect(html).toContain(">未着手<");
    // Learning progress card lists only the started theme (name appears in card + list).
    expect(html).toContain("2 / 5 コンテンツ完了");
    expect(html).not.toContain("0 / 4 コンテンツ完了");
  });

  it("2テーマ学習中: 完了率の高い順に並べる", async () => {
    setup([GAS(1), WEB(4)]);

    const html = await render();

    expect(html).toContain("1 / 4 コンテンツ完了");
    expect(html).toContain("4 / 5 コンテンツ完了");
    expect(html.indexOf("4 / 5 コンテンツ完了")).toBeLessThan(html.indexOf("1 / 4 コンテンツ完了"));
  });

  it("1テーマ修了: 「修了」の区分と修了証へのリンクを出し、学習中のバーには入れない", async () => {
    setup([GAS(4), WEB(1)]);

    const html = await render();

    expect(html).toContain(">修了<");
    expect(html).toContain('href="/certificates"');
    expect(html).not.toContain("4 / 4 コンテンツ完了");
    expect(html).toContain("1 / 5 コンテンツ完了");
  });

  it("修了証の対象外（admin）は「修了」バッジのみでリンクを出さない", async () => {
    setup([GAS(4)], { userRole: "admin" });

    const html = await render();

    expect(html).toContain(">修了<");
    expect(html).not.toContain('href="/certificates"');
    expect(html).toContain("すべてのテーマを修了しました");
  });

  it("お試しの「次のステップ」カードの条件（全テーマの分母で100%）は変わらない", async () => {
    setup([summary(1, "GAS学習", 2, 2), summary(2, "Web開発", 1, 3)], { userStatus: "trial" });
    expect(await render()).not.toContain("次のステップ");

    setup([summary(1, "GAS学習", 2, 2), summary(2, "Web開発", 3, 3)], { userStatus: "trial" });
    expect(await render()).toContain("次のステップ");
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
    setup([]);

    const html = await render();

    expect(html).toContain("学習コンテンツはまだ登録されていません");
  });
});
