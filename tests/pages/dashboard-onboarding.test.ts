import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ダッシュボードの初回ガイド表示条件をページ単位で検証する（issue #16）。
// データ取得はすべてモックし、ダイアログ・チェックリストの表示有無を確認する。

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/onboarding-server");
// クライアントのダイアログは props（絞り込み済みステップ）の検証に必要な最小表示に差し替える
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
    // 実コンポーネントと同様、全達成のときは描画しない
    GettingStartedChecklist: ({ items }: { items: { completed: boolean }[] }) =>
      items.some((item) => !item.completed)
        ? createElement("div", { "data-testid": "getting-started" }, "steps")
        : null,
  };
});

import HomePage from "@/app/(authenticated)/page";
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
};

const render = async () => renderToStaticMarkup(await HomePage());

/** ダイアログの data-steps 属性値だけを取り出して検証する（ページ全体の部分一致は使わない） */
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
