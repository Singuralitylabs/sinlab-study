import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Invariant under test: the slide PDF signed URL is issued only after the view-permission check
// (#89). Data fetching and signing are all mocked; the tests check the rendered HTML and whether
// the signing function was called.

vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/slides-server");
vi.mock("@/app/services/api/upgrade-price-server", () => ({
  fetchUpgradePriceLabel: vi.fn().mockResolvedValue("月額1,500円（税込）"),
}));
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
vi.mock("@/app/components/SlideContent", () => ({
  SlideContent: ({ signedUrl }: { signedUrl: string | null }) =>
    createElement("div", { "data-testid": "slide-content" }, signedUrl ?? "SLIDE_UNAVAILABLE"),
}));
vi.mock("@/app/components/AIReviewDisplayNoSSR", () => ({ AIReviewDisplayNoSSR: () => null }));
vi.mock("@/app/components/YouTubeEmbed", () => ({
  YouTubeEmbed: () => createElement("div", { "data-testid": "youtube-embed" }),
}));
vi.mock(
  "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/CompleteButton",
  () => ({ CompleteButton: () => createElement("div", { "data-testid": "complete-button" }) })
);
vi.mock(
  "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/SubmissionForm",
  () => ({ SubmissionForm: () => null })
);

import { track } from "@vercel/analytics/server";
import ContentPage from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/page";
import type { NavigationContent } from "@/app/lib/content-navigation";
import {
  fetchContentById,
  fetchThemeNavigationIndex,
  fetchWeekById,
} from "@/app/services/api/learning-server";
import { createSlideSignedUrl } from "@/app/services/api/slides-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
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
  extraWeekContents = [],
  weekOverride,
  contentWeekOverride,
}: {
  userStatus: "active" | "trial";
  userRole?: "member" | "admin" | "maintainer";
  isOpenToTrial: boolean;
  isPublished?: boolean;
  signedUrl?: string | null;
  orderedContents?: NavigationContent[];
  extraWeekContents?: Array<{
    id: number;
    title: string;
    display_order: number;
    is_open_to_trial?: boolean;
    is_published?: boolean;
  }>;
  weekOverride?: typeof week;
  contentWeekOverride?: typeof week;
}) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchWeekById).mockResolvedValue({
    data: weekOverride ?? week,
    error: null,
  } as never);
  vi.mocked(fetchThemeNavigationIndex).mockResolvedValue({
    data: {
      orderedContents: orderedContents ?? [currentNav],
      paidOnlyCount: 3,
      paidOnlyExerciseCount: 1,
      currentWeekContents: [
        currentSummary(isOpenToTrial, isPublished),
        ...extraWeekContents.map((content) => ({
          id: content.id,
          title: content.title,
          content_type: "text" as const,
          display_order: content.display_order,
          is_open_to_trial: content.is_open_to_trial ?? true,
          is_published: content.is_published ?? true,
          week_id: 3,
        })),
      ],
    },
    error: null,
  } as never);
  vi.mocked(fetchContentById).mockResolvedValue({
    data: slideContent({
      is_open_to_trial: isOpenToTrial,
      is_published: isPublished,
      week: contentWeekOverride ?? weekOverride ?? week,
    }),
    error: null,
  } as never);
  vi.mocked(createSlideSignedUrl).mockResolvedValue(signedUrl);
};

const render = async () => renderToStaticMarkup(await ContentPage({ params }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(fetchUpgradePriceLabel).mockResolvedValue("月額1,500円（税込）");
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
    expect(track).toHaveBeenCalledWith("locked_content_viewed", { content_type: "slide" });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("@");
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

  it("member は theme だけ未公開のとき 404（署名を発行しない）", async () => {
    // week.phase.theme_id matches but the embedded theme is unpublished (equivalent to null under
    // RLS).
    const weekThemeUnpublished = {
      ...week,
      phase: {
        ...week.phase,
        theme: { id: 1, name: "GAS", is_published: false, is_deleted: false },
      },
    };
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      weekOverride: weekThemeUnpublished,
      contentWeekOverride: weekThemeUnpublished,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSlideSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"] as const)(
    "%s は theme 未公開でもプレビューとして署名付きURLを発行する",
    async (userRole) => {
      const weekThemeUnpublished = {
        ...week,
        phase: {
          ...week.phase,
          theme: { id: 1, name: "GAS", is_published: false, is_deleted: false },
        },
      };
      setup({
        userStatus: "active",
        userRole,
        isOpenToTrial: false,
        weekOverride: weekThemeUnpublished,
        contentWeekOverride: weekThemeUnpublished,
      });

      const html = await render();

      expect(createSlideSignedUrl).toHaveBeenCalledWith(PDF_KEY);
      expect(html).toContain(SIGNED_URL);
    }
  );
});

describe("親階層が未公開のロック対象コンテンツ（issue #242）", () => {
  const themeUnpublishedWeek = {
    ...week,
    phase: {
      ...week.phase,
      theme: { id: 1, name: "非公開テーマ", is_published: false, is_deleted: false },
    },
  };

  it("お試しユーザーは theme だけ未公開のロック対象コンテンツで、ロック画面ではなく 404 になる", async () => {
    // The summary (service_role) only looks at the content row's is_published, so it is found.
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      weekOverride: themeUnpublishedWeek,
      contentWeekOverride: themeUnpublishedWeek,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSlideSignedUrl).not.toHaveBeenCalled();
  });

  it("お試しユーザーは RLS で theme 埋め込みが null のときも 404 になる", async () => {
    const themeHiddenWeek = { ...week, phase: { ...week.phase, theme: null } };
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      weekOverride: themeHiddenWeek as unknown as typeof week,
      contentWeekOverride: themeHiddenWeek as unknown as typeof week,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("お試しユーザーは phase が論理削除済みのロック対象コンテンツでも 404 になる", async () => {
    const phaseDeletedWeek = { ...week, phase: { ...week.phase, is_deleted: true } };
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      weekOverride: phaseDeletedWeek,
      contentWeekOverride: phaseDeletedWeek,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("お試しユーザーは theme だけ未公開のお試し公開コンテンツでも 404 になる", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: true,
      weekOverride: themeUnpublishedWeek,
      contentWeekOverride: themeUnpublishedWeek,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSlideSignedUrl).not.toHaveBeenCalled();
  });

  it("全階層が公開済みならロック画面は従来どおり表示される", async () => {
    setup({ userStatus: "trial", isOpenToTrial: false });

    const html = await render();

    expect(html).toContain("このコンテンツは無料プランでは閲覧できません");
    expect(html).toContain("基礎文法（スライド）");
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

  it("ナビ縮退時（orderedContents: []）でもページが落ちず フェーズに戻る が出る", async () => {
    setup({ userStatus: "active", isOpenToTrial: false, orderedContents: [] });

    const html = await render();

    expect(html).toContain("フェーズに戻る");
    expect(html).toContain('href="/learn/1/2"');
    expect(html).not.toContain("テーマに戻る");
  });

  it("ナビ縮退時でも同じ週の次へは出る", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [],
      extraWeekContents: [{ id: 11, title: "同じ週の次", display_order: 2 }],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/3/11"');
    expect(html).toContain("同じ週の次");
    expect(html).not.toContain("次の週:");
    expect(html).not.toContain("テーマに戻る");
    expect(html).not.toContain("フェーズに戻る");
  });

  it("通し列に現在が無い縮退時は フェーズに戻る（テーマ末尾と区別）", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [nextWeek],
    });

    const html = await render();

    expect(html).toContain("フェーズに戻る");
    expect(html).toContain('href="/learn/1/2"');
    expect(html).not.toContain("テーマに戻る");
  });
});

describe("概要欄カードの表示位置（issue #221）", () => {
  it("概要ありスライドでは概要カードがビューアの下・完了ボタンの前に表示される", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({ description: "概要テスト本文" }),
      error: null,
    } as never);

    const html = await render();

    const bodyIndex = html.indexOf('data-testid="slide-content"');
    const overviewIndex = html.indexOf("概要テスト本文");
    const completeIndex = html.indexOf('data-testid="complete-button"');
    expect(bodyIndex).toBeGreaterThanOrEqual(0);
    expect(overviewIndex).toBeGreaterThan(bodyIndex);
    expect(completeIndex).toBeGreaterThan(overviewIndex);
    expect(html).toContain(">概要</h2>");
  });

  it("概要あり動画では概要カードがプレイヤーの下・完了ボタンの前に表示される", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: {
        ...slideContent({ description: "概要テスト本文" }),
        content_type: "video",
        video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        pdf_url: null,
      },
      error: null,
    } as never);

    const html = await render();

    const bodyIndex = html.indexOf('data-testid="youtube-embed"');
    const overviewIndex = html.indexOf("概要テスト本文");
    const completeIndex = html.indexOf('data-testid="complete-button"');
    expect(bodyIndex).toBeGreaterThanOrEqual(0);
    expect(overviewIndex).toBeGreaterThan(bodyIndex);
    expect(completeIndex).toBeGreaterThan(overviewIndex);
    expect(html).toContain(">概要</h2>");
  });

  it("概要未設定（NULL）のスライドでは概要カードを表示しない", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });

    const html = await render();

    expect(html).toContain('data-testid="slide-content"');
    expect(html).not.toContain("概要テスト本文");
    expect(html).not.toContain(">概要</h2>");
  });
});

describe("お試し → 有料の転換導線（ロック画面, #288）", () => {
  it("Stripe有効: 定型の概要・規模・実額・/upgrade への CTA を表示する", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup({ userStatus: "trial", isOpenToTrial: false });
    vi.mocked(fetchUpgradePriceLabel).mockResolvedValue("月額2,000円（税込）");

    const html = await render();

    expect(html).toContain("このコンテンツではスライドで学びます");
    expect(html).toContain("有料会員向けのコンテンツが3件（うち演習1件）");
    expect(html).toContain("月額2,000円（税込）で全コンテンツが使えます");
    expect(html).toContain('href="/upgrade"');
    expect(html).toContain('data-analytics-source="lock_screen"');
    expect(html).toContain("もくもく会への参加");
  });

  it("Stripe無効: /upgrade への導線を出さず承認の案内のみ表示する", async () => {
    vi.stubEnv("STRIPE_ENABLED", "false");
    setup({ userStatus: "trial", isOpenToTrial: false });

    const html = await render();

    expect(html).not.toContain('href="/upgrade"');
    expect(fetchUpgradePriceLabel).not.toHaveBeenCalled();
    expect(html).toContain("本登録は運営の承認で行います");
  });

  it.each([
    ["active", "member"],
    ["active", "admin"],
  ] as const)("%s / %s にはロック画面も CTA も出ない", async (userStatus, userRole) => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup({ userStatus, userRole, isOpenToTrial: false });

    const html = await render();

    expect(html).not.toContain("有料会員になると使えるもの");
    expect(html).not.toContain('href="/upgrade"');
  });
});
