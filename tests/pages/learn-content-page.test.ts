import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// スライドPDFの署名付きURLが「閲覧権限チェックの後にのみ」発行されることを、
// ページ単位で検証する（issue #89）。データ取得・署名発行はすべてモックし、
// 描画結果（HTML）と署名関数の呼び出し有無を確認する。

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/slides-server");
vi.mock("@/app/services/api/ai-review-server");
vi.mock("@/app/services/api/submissions-server");
vi.mock("@/app/services/api/learning-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/learning-server")>();
  return {
    ...actual,
    fetchWeekById: vi.fn(),
    fetchThemeNavigationIndex: vi.fn(),
    fetchContentById: vi.fn(),
    fetchUserProgressByContentId: vi.fn().mockResolvedValue({ isCompleted: false }),
  };
});
// クライアントコンポーネント（PDFビューア・提出フォーム等）は描画結果の検証に不要なため差し替える
vi.mock("@/app/components/SlideContent", () => ({
  SlideContent: ({ signedUrl }: { signedUrl: string | null }) =>
    createElement("div", { "data-testid": "slide-content" }, signedUrl ?? "SLIDE_UNAVAILABLE"),
}));
vi.mock("@/app/components/AIReviewDisplayNoSSR", () => ({ AIReviewDisplayNoSSR: () => null }));
vi.mock("@/app/components/YouTubeEmbed", () => ({ YouTubeEmbed: () => null }));
vi.mock(
  "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/CompleteButton",
  () => ({ CompleteButton: () => null })
);
vi.mock(
  "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/SubmissionForm",
  () => ({ SubmissionForm: () => null })
);

import ContentPage from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/page";
import type { NavigationContent } from "@/app/lib/content-navigation";
import {
  fetchContentById,
  fetchThemeNavigationIndex,
  fetchWeekById,
} from "@/app/services/api/learning-server";
import { createSlideSignedUrl } from "@/app/services/api/slides-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/slides/gas/slide-01.pdf?token=x";
const PDF_KEY = "gas/slide-01.pdf";

const params = Promise.resolve({ themeId: "1", phaseId: "2", weekId: "3", contentId: "10" });

const publishedLayer = { is_published: true, is_deleted: false };
const week = {
  id: 3,
  phase_id: 2,
  name: "第1週",
  ...publishedLayer,
  phase: {
    id: 2,
    theme_id: 1,
    name: "フェーズ1",
    ...publishedLayer,
    theme: { id: 1, name: "GAS", ...publishedLayer },
  },
};

const currentNav: NavigationContent = {
  id: 10,
  title: "基礎文法（スライド）",
  weekId: 3,
  weekName: "第1週",
  phaseId: 2,
  phaseName: "フェーズ1",
};

const currentSummary = (isOpenToTrial: boolean, isPublished: boolean) => ({
  id: 10,
  title: "基礎文法（スライド）",
  content_type: "slide",
  display_order: 1,
  is_open_to_trial: isOpenToTrial,
  is_published: isPublished,
  week_id: 3,
});

const slideContent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  week_id: 3,
  title: "基礎文法（スライド）",
  content_type: "slide",
  pdf_url: PDF_KEY,
  description: null,
  is_published: true,
  is_deleted: false,
  is_open_to_trial: false,
  week,
  ...overrides,
});

const setup = ({
  userStatus,
  userRole = "member",
  isOpenToTrial,
  isPublished = true,
  signedUrl = SIGNED_URL,
  orderedContents,
}: {
  userStatus: "active" | "trial";
  userRole?: "member" | "admin" | "maintainer";
  isOpenToTrial: boolean;
  isPublished?: boolean;
  signedUrl?: string | null;
  orderedContents?: NavigationContent[];
}) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchWeekById).mockResolvedValue({ data: week, error: null } as never);
  vi.mocked(fetchThemeNavigationIndex).mockResolvedValue({
    data: {
      orderedContents: orderedContents ?? [currentNav],
      currentWeekContents: [currentSummary(isOpenToTrial, isPublished)],
    },
    error: null,
  } as never);
  vi.mocked(fetchContentById).mockResolvedValue({
    data: slideContent({ is_open_to_trial: isOpenToTrial, is_published: isPublished }),
    error: null,
  } as never);
  vi.mocked(createSlideSignedUrl).mockResolvedValue(signedUrl);
};

const render = async () => renderToStaticMarkup(await ContentPage({ params }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("学習画面のスライド配信（署名付きURL）", () => {
  it("active ユーザーは署名付きURLが発行され、ビューアへ渡される", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });

    const html = await render();

    expect(createSlideSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSlideSignedUrl).toHaveBeenCalledWith(PDF_KEY);
    expect(html).toContain(SIGNED_URL);
  });

  it("お試しユーザーはお試し公開スライドを閲覧できる", async () => {
    setup({ userStatus: "trial", isOpenToTrial: true });

    const html = await render();

    expect(createSlideSignedUrl).toHaveBeenCalledWith(PDF_KEY);
    expect(html).toContain(SIGNED_URL);
  });

  it("お試しユーザーのロック済みスライドでは、署名付きURLを発行しない", async () => {
    setup({ userStatus: "trial", isOpenToTrial: false });

    const html = await render();

    expect(createSlideSignedUrl).not.toHaveBeenCalled();
    expect(html).not.toContain(SIGNED_URL);
    expect(html).not.toContain(PDF_KEY);
    expect(html).toContain("このコンテンツは無料プランでは閲覧できません");
  });

  it.each(["admin", "maintainer"] as const)(
    "%s は未公開スライドのプレビューでも署名付きURLが発行される",
    async (userRole) => {
      setup({ userStatus: "active", userRole, isOpenToTrial: false, isPublished: false });

      const html = await render();

      expect(createSlideSignedUrl).toHaveBeenCalledWith(PDF_KEY);
      expect(html).toContain(SIGNED_URL);
    }
  );

  it("署名付きURLの発行に失敗してもページは落ちず、ビューアの代わりに案内を表示する", async () => {
    setup({ userStatus: "active", isOpenToTrial: false, signedUrl: null });

    const html = await render();

    expect(html).toContain("SLIDE_UNAVAILABLE");
    expect(html).not.toContain(PDF_KEY);
  });
});

describe("コンテンツ詳細の前後ナビゲーション（issue #208）", () => {
  const nextWeek: NavigationContent = {
    id: 20,
    title: "テンプレートを作る",
    weekId: 4,
    weekName: "第2週",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const nextPhase: NavigationContent = {
    id: 30,
    title: "応用の最初",
    weekId: 5,
    weekName: "第1週",
    phaseId: 3,
    phaseName: "フェーズ2",
  };
  const sameWeekNext: NavigationContent = {
    id: 11,
    title: "同じ週の次",
    weekId: 3,
    weekName: "第1週",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const lockedNext: NavigationContent = {
    id: 21,
    title: "ロック済みの次",
    weekId: 4,
    weekName: "第2週",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const unpublishedNext: NavigationContent = {
    id: 40,
    title: "未公開の次",
    weekId: 4,
    weekName: "第2週",
    phaseId: 2,
    phaseName: "フェーズ1",
  };

  it("週末尾: 次週の先頭への href（weekId が現在URLと違う）を含み、次の週: を含む", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, nextWeek],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/4/20"');
    expect(html).toContain("次の週: ");
    expect(html).toContain("第2週");
  });

  it("フェーズ末尾: 次フェーズの先頭への href（phaseId も違う）を含み、次のフェーズ: を含む", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, nextPhase],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/3/5/30"');
    expect(html).toContain("次のフェーズ: ");
    expect(html).toContain("フェーズ2");
  });

  it("同一週内: 次の週: も 次のフェーズ: も含まない", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, sameWeekNext],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/3/11"');
    expect(html).not.toContain("次の週:");
    expect(html).not.toContain("次のフェーズ:");
  });

  it("テーマ末尾: テーマに戻る と href=/learn/{themeId} を含み、フェーズに戻る を含まない", async () => {
    setup({ userStatus: "active", isOpenToTrial: false, orderedContents: [currentNav] });

    const html = await render();

    expect(html).toContain("テーマに戻る");
    expect(html).toContain('href="/learn/1"');
    expect(html).not.toContain("フェーズに戻る");
  });

  it("テーマ先頭: 「前へ」リンクが無い", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, sameWeekNext],
    });

    const html = await render();

    expect(html).not.toContain('href="/learn/1/2/3/9"');
    expect(html).toContain('href="/learn/1/2/3/11"');
  });

  it("trial のロック画面でも前後ナビが描画される", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      orderedContents: [currentNav, nextWeek],
    });

    const html = await render();

    expect(html).toContain("このコンテンツは無料プランでは閲覧できません");
    expect(html).toContain('href="/learn/1/2/4/20"');
  });

  it("trial でロック済み（is_open_to_trial: false）コンテンツが遷移先になる", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: true,
      orderedContents: [currentNav, lockedNext],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/4/21"');
    expect(html).toContain("ロック済みの次");
  });

  it.each(["admin", "maintainer"] as const)(
    "%s で is_published: false の次コンテンツへのリンクが出る",
    async (userRole) => {
      setup({
        userStatus: "active",
        userRole,
        isOpenToTrial: false,
        isPublished: true,
        orderedContents: [currentNav, unpublishedNext],
      });

      const html = await render();

      expect(html).toContain('href="/learn/1/2/4/40"');
      expect(html).toContain("未公開の次");
    }
  );

  it("ナビ縮退時（orderedContents: []）でもページが落ちず テーマに戻る が出る", async () => {
    setup({ userStatus: "active", isOpenToTrial: false, orderedContents: [] });

    const html = await render();

    expect(html).toContain("テーマに戻る");
    expect(html).toContain('href="/learn/1"');
  });
});
