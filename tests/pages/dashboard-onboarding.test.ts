import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/onboarding-server");
vi.mock("@/app/services/api/announcements-server");
vi.mock("@/app/services/api/upgrade-price-server", () => ({
  fetchUpgradePriceLabel: vi.fn().mockResolvedValue("月額1,500円（税込）"),
}));
// Replace the client dialog with the minimal rendering needed to check props (filtered steps).
vi.mock("@/app/(authenticated)/components/WelcomeDialog", () => ({
  WelcomeDialog: ({ steps }: { steps: { id: string }[] }) =>
    createElement(
      "div",
      { "data-testid": "welcome-dialog", "data-steps": steps.map((step) => step.id).join(",") },
      "welcome"
    ),
}));
vi.mock("@/app/(authenticated)/components/GettingStartedChecklist", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/app/(authenticated)/components/GettingStartedChecklist")
    >();
  return {
    ...actual,
    GettingStartedChecklist: ({ items }: { items: { completed: boolean }[] }) =>
      items.some((item) => !item.completed)
        ? createElement("div", { "data-testid": "getting-started" }, "steps")
        : null,
  };
});

import HomePage from "@/app/(authenticated)/page";
import { getViewerAnnouncements } from "@/app/services/api/announcements-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
import {
  fetchGettingStartedProgress,
  fetchOnboardingStatus,
} from "@/app/services/api/onboarding-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const themeSummary = (completedContents: number) => ({
  theme: { id: 1, name: "GAS学習", description: null, image_url: null },
  totalContents: 2,
  completedContents,
});

const setup = ({
  userRole = "member",
  userStatus = "active",
  completedAt = null,
  onboardingError = null,
  completedContents = 0,
  hasSubmission = false,
  hasCompletedReview = false,
}: {
  userRole?: "member" | "admin" | "maintainer";
  userStatus?: "active" | "trial";
  completedAt?: string | null;
  onboardingError?: { message: string } | null;
  completedContents?: number;
  hasSubmission?: boolean;
  hasCompletedReview?: boolean;
}) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
    data: [themeSummary(completedContents)],
    error: null,
  } as never);
  vi.mocked(fetchOnboardingStatus).mockResolvedValue({
    data: completedAt === null && onboardingError ? null : { completedAt },
    error: onboardingError,
  } as never);
  vi.mocked(fetchGettingStartedProgress).mockResolvedValue({
    data: { hasSubmission, hasCompletedReview },
    error: null,
  } as never);
  vi.mocked(getViewerAnnouncements).mockResolvedValue({ data: [], error: null });
};

const render = async () => renderToStaticMarkup(await HomePage());

const stepsOf = (html: string): string[] =>
  (html.match(/data-steps="([^"]*)"/)?.[1] ?? "").split(",");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ダッシュボードの初回ガイド表示条件（issue #16）", () => {
  it("未完了の member にはダイアログとチェックリストを表示する", async () => {
    setup({});

    const html = await render();

    expect(html).toContain('data-testid="welcome-dialog"');
    expect(html).toContain('data-testid="getting-started"');
  });

  it("trial にはプランのステップを含め、active には含めない", async () => {
    setup({ userStatus: "trial" });
    const trialHtml = await render();
    expect(stepsOf(trialHtml)).toEqual(["welcome", "how-to-learn", "plan", "help"]);

    setup({ userStatus: "active" });
    const activeHtml = await render();
    expect(stepsOf(activeHtml)).toEqual(["welcome", "how-to-learn", "help"]);
  });

  it("完了済み・全達成の member にはいずれも表示しない", async () => {
    setup({
      completedAt: "2026-09-22T00:00:00+00:00",
      completedContents: 2,
      hasSubmission: true,
      hasCompletedReview: true,
    });

    const html = await render();

    expect(html).not.toContain('data-testid="welcome-dialog"');
    expect(html).not.toContain('data-testid="getting-started"');
  });

  it.each(["admin", "maintainer"] as const)("%s にはいずれも表示しない", async (userRole) => {
    setup({ userRole });

    const html = await render();

    expect(html).not.toContain('data-testid="welcome-dialog"');
    expect(html).not.toContain('data-testid="getting-started"');
  });

  it("完了状態の取得に失敗したときダイアログを出さない", async () => {
    setup({ onboardingError: { message: "db error" } });

    const html = await render();

    expect(html).not.toContain('data-testid="welcome-dialog"');
  });
});

describe("ダッシュボードの未読のお知らせ（issue #254）", () => {
  const announcement = (id: number, isRead: boolean) => ({
    id,
    title: `お知らせ${id}`,
    published_at: "2026-10-01T00:00:00Z",
    target_statuses: ["active"],
    target_membership_types: null,
    isRead,
  });

  it("未読のお知らせを最大3件表示し、既読は表示しない", async () => {
    setup({ completedAt: "2026-09-01T00:00:00Z" });
    vi.mocked(getViewerAnnouncements).mockResolvedValue({
      data: [
        announcement(1, false),
        announcement(2, true),
        announcement(3, false),
        announcement(4, false),
        announcement(5, false),
      ],
      error: null,
    });

    const html = await render();

    expect(html).toContain("未読のお知らせ");
    expect(html).toContain('href="/announcements/1"');
    expect(html).toContain('href="/announcements/3"');
    expect(html).toContain('href="/announcements/4"');
    expect(html).not.toContain('href="/announcements/5"');
    expect(html).not.toContain('href="/announcements/2"');
  });

  it("未読が無ければお知らせの枠を表示しない", async () => {
    setup({ completedAt: "2026-09-01T00:00:00Z" });
    vi.mocked(getViewerAnnouncements).mockResolvedValue({
      data: [announcement(1, true)],
      error: null,
    });

    const html = await render();

    expect(html).not.toContain("未読のお知らせ");
  });
});

describe("ダッシュボードの「次のステップ」カード（issue #288）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("全完了の trial member には Stripe 有効で CTA 付きのカードを表示する", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup({ userStatus: "trial", completedContents: 2 });

    const html = await render();

    expect(html).toContain("お試しコンテンツをすべて完了しました");
    expect(html).toContain('href="/upgrade"');
    expect(html.indexOf("次のステップ")).toBeLessThan(
      html.indexOf('data-testid="getting-started"') === -1
        ? Number.POSITIVE_INFINITY
        : html.indexOf('data-testid="getting-started"')
    );
  });

  it("Stripe 無効時は承認の案内のみで /upgrade への導線を出さない", async () => {
    vi.stubEnv("STRIPE_ENABLED", "false");
    setup({ userStatus: "trial", completedContents: 2 });

    const html = await render();

    expect(html).toContain("本登録は運営の承認で行います");
    expect(html).not.toContain('href="/upgrade"');
  });

  it.each([
    ["未完了", { userStatus: "trial", completedContents: 1 }],
    ["active", { userStatus: "active", completedContents: 2 }],
    ["admin", { userStatus: "trial", userRole: "admin", completedContents: 2 }],
  ] as const)("%s には表示しない", async (_label, options) => {
    setup(options);

    const html = await render();

    expect(html).not.toContain("お試しコンテンツをすべて完了しました");
  });
});
