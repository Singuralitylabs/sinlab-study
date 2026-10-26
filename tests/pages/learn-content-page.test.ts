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
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/slides-server");
vi.mock("@/app/services/api/stream-server");
vi.mock("@/app/services/api/upgrade-price-server", () => ({
  fetchUpgradePriceLabel: vi.fn().mockResolvedValue("月額1,500円（税込）"),
}));
vi.mock("@/app/services/api/ai-review-server");
vi.mock("@/app/services/api/submissions-server");
vi.mock("@/app/services/api/ai-review-usage-server");
vi.mock("@/app/services/api/review-list-server", () => ({
  fetchReviewNotesForContent: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock("@/app/services/api/supabase-server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/services/api/learning-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/learning-server")>();
  return {
    ...actual,
    fetchPhaseWithBreadcrumbById: vi.fn(),
    fetchThemeNavigationIndex: vi.fn(),
    fetchContentById: vi.fn(),
    fetchExerciseReferenceAnswer: vi.fn().mockResolvedValue({ data: null, error: null }),
    fetchUserProgressByContentId: vi.fn().mockResolvedValue({
      isCompleted: false,
      retryStartedAt: null,
    }),
    fetchExerciseReviewPassState: vi.fn().mockResolvedValue({
      requiresPass: false,
      passUnachievable: false,
      hasPassingReview: false,
    }),
  };
});
vi.mock("@/app/services/api/ai-review-settings-server", () => ({
  fetchCurrentAIReviewLimits: vi.fn().mockResolvedValue({
    active: { perContentPerDay: 2, perDay: 10 },
    trial: { perContentLifetime: 1 },
  }),
}));
vi.mock("@/app/components/SlideContent", () => ({
  SlideContent: ({ signedUrl }: { signedUrl: string | null }) =>
    createElement("div", { "data-testid": "slide-content" }, signedUrl ?? "SLIDE_UNAVAILABLE"),
}));
vi.mock("@/app/components/AIReviewDisplayNoSSR", () => ({ AIReviewDisplayNoSSR: () => null }));
vi.mock("@/app/components/StreamEmbed", () => ({
  StreamEmbed: ({ iframeSrc }: { iframeSrc: string }) =>
    createElement("div", { "data-testid": "stream-embed" }, iframeSrc),
}));
vi.mock("@/app/components/YouTubeEmbed", () => ({
  YouTubeEmbed: () => createElement("div", { "data-testid": "youtube-embed" }),
}));
vi.mock("@/app/(authenticated)/learn/[themeId]/[phaseId]/[contentId]/CompleteButton", () => ({
  CompleteButton: () => createElement("div", { "data-testid": "complete-button" }),
}));
vi.mock("@/app/(authenticated)/learn/[themeId]/[phaseId]/[contentId]/SubmissionForm", () => ({
  SubmissionForm: () => null,
}));

import { track } from "@vercel/analytics/server";
import ContentPage from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[contentId]/page";
import type { NavigationContent } from "@/app/lib/content-navigation";
import { fetchCompletedAIReviewByContentId } from "@/app/services/api/ai-review-server";
import { fetchAIReviewUsage } from "@/app/services/api/ai-review-usage-server";
import {
  fetchContentById,
  fetchExerciseReferenceAnswer,
  fetchExerciseReviewPassState,
  fetchPhaseWithBreadcrumbById,
  fetchThemeNavigationIndex,
  fetchUserProgressByContentId,
} from "@/app/services/api/learning-server";
import { createSlideSignedUrl } from "@/app/services/api/slides-server";
import { createStreamPlaybackForMember } from "@/app/services/api/stream-server";
import { fetchLatestSubmissionByContentId } from "@/app/services/api/submissions-server";
import { fetchUpgradePriceLabel } from "@/app/services/api/upgrade-price-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/slides/gas/slide-01.pdf?token=x";
const PDF_KEY = "gas/slide-01.pdf";

const params = Promise.resolve({ themeId: "1", phaseId: "2", contentId: "10" });

const publishedLayer = { is_published: true, is_deleted: false };
const phase = {
  id: 2,
  theme_id: 1,
  name: "フェーズ1",
  ...publishedLayer,
  theme: { id: 1, name: "GAS", ...publishedLayer },
};

const currentNav: NavigationContent = {
  id: 10,
  title: "基礎文法（スライド）",
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
  phase_id: 2,
});

const slideContent = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  phase_id: 2,
  title: "基礎文法（スライド）",
  content_type: "slide",
  pdf_url: PDF_KEY,
  description: null,
  is_published: true,
  is_deleted: false,
  is_open_to_trial: false,
  phase,
  ...overrides,
});

const setup = ({
  userStatus,
  userRole = "member",
  isOpenToTrial,
  isPublished = true,
  signedUrl = SIGNED_URL,
  orderedContents,
  extraPhaseContents = [],
  phaseOverride,
  contentPhaseOverride,
}: {
  userStatus: "active" | "trial";
  userRole?: "member" | "admin" | "maintainer";
  isOpenToTrial: boolean;
  isPublished?: boolean;
  signedUrl?: string | null;
  orderedContents?: NavigationContent[];
  extraPhaseContents?: Array<{
    id: number;
    title: string;
    display_order: number;
    is_open_to_trial?: boolean;
    is_published?: boolean;
  }>;
  phaseOverride?: typeof phase;
  contentPhaseOverride?: typeof phase;
}) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus,
    userRole,
  } as never);
  vi.mocked(fetchPhaseWithBreadcrumbById).mockResolvedValue({
    data: phaseOverride ?? phase,
    error: null,
  } as never);
  vi.mocked(fetchThemeNavigationIndex).mockResolvedValue({
    data: {
      orderedContents: orderedContents ?? [currentNav],
      paidOnlyCount: 3,
      paidOnlyExerciseCount: 1,
      currentPhaseContents: [
        currentSummary(isOpenToTrial, isPublished),
        ...extraPhaseContents.map((content) => ({
          id: content.id,
          title: content.title,
          content_type: "text" as const,
          display_order: content.display_order,
          is_open_to_trial: content.is_open_to_trial ?? true,
          is_published: content.is_published ?? true,
          phase_id: 2,
        })),
      ],
    },
    error: null,
  } as never);
  vi.mocked(fetchContentById).mockResolvedValue({
    data: slideContent({
      is_open_to_trial: isOpenToTrial,
      is_published: isPublished,
      phase: contentPhaseOverride ?? phaseOverride ?? phase,
    }),
    error: null,
  } as never);
  vi.mocked(createSlideSignedUrl).mockResolvedValue(signedUrl);
};

const render = async () => renderToStaticMarkup(await ContentPage({ params }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(fetchExerciseReferenceAnswer).mockResolvedValue({ data: null, error: null });
  vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({ data: null } as never);
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
    // phase.theme_id matches but the embedded theme is unpublished (equivalent to null under
    // RLS).
    const phaseThemeUnpublished = {
      ...phase,
      theme: { id: 1, name: "GAS", is_published: false, is_deleted: false },
    };
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      phaseOverride: phaseThemeUnpublished,
      contentPhaseOverride: phaseThemeUnpublished,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSlideSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"] as const)(
    "%s は theme 未公開でもプレビューとして署名付きURLを発行する",
    async (userRole) => {
      const phaseThemeUnpublished = {
        ...phase,
        theme: { id: 1, name: "GAS", is_published: false, is_deleted: false },
      };
      setup({
        userStatus: "active",
        userRole,
        isOpenToTrial: false,
        phaseOverride: phaseThemeUnpublished,
        contentPhaseOverride: phaseThemeUnpublished,
      });

      const html = await render();

      expect(createSlideSignedUrl).toHaveBeenCalledWith(PDF_KEY);
      expect(html).toContain(SIGNED_URL);
    }
  );
});

describe("親階層が未公開のロック対象コンテンツ（issue #242）", () => {
  const themeUnpublishedPhase = {
    ...phase,
    theme: { id: 1, name: "非公開テーマ", is_published: false, is_deleted: false },
  };

  it("お試しユーザーは theme だけ未公開のロック対象コンテンツで、ロック画面ではなく 404 になる", async () => {
    // The summary (service_role) only looks at the content row's is_published, so it is found.
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      phaseOverride: themeUnpublishedPhase,
      contentPhaseOverride: themeUnpublishedPhase,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createSlideSignedUrl).not.toHaveBeenCalled();
  });

  it("お試しユーザーは RLS で theme 埋め込みが null のときも 404 になる", async () => {
    const themeHiddenPhase = { ...phase, theme: null };
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      phaseOverride: themeHiddenPhase as unknown as typeof phase,
      contentPhaseOverride: themeHiddenPhase as unknown as typeof phase,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("お試しユーザーは phase が論理削除済みのロック対象コンテンツでも 404 になる", async () => {
    const phaseDeleted = { ...phase, is_deleted: true };
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      phaseOverride: phaseDeleted,
      contentPhaseOverride: phaseDeleted,
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("お試しユーザーは theme だけ未公開のお試し公開コンテンツでも 404 になる", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: true,
      phaseOverride: themeUnpublishedPhase,
      contentPhaseOverride: themeUnpublishedPhase,
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
  const nextInPhase: NavigationContent = {
    id: 20,
    title: "テンプレートを作る",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const nextPhase: NavigationContent = {
    id: 30,
    title: "応用の最初",
    phaseId: 3,
    phaseName: "フェーズ2",
  };
  const samePhaseNext: NavigationContent = {
    id: 11,
    title: "同じフェーズの次",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const lockedNext: NavigationContent = {
    id: 21,
    title: "ロック済みの次",
    phaseId: 2,
    phaseName: "フェーズ1",
  };
  const unpublishedNext: NavigationContent = {
    id: 40,
    title: "未公開の次",
    phaseId: 2,
    phaseName: "フェーズ1",
  };

  it("フェーズ末尾: 次フェーズの先頭への href（phaseId も違う）を含み、次のフェーズ: を含む", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, nextPhase],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/3/30"');
    expect(html).toContain("次のフェーズ: ");
    expect(html).toContain("フェーズ2");
  });

  it("同一フェーズ内: 次のフェーズ: を含まない", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [currentNav, samePhaseNext],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/11"');
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
      orderedContents: [currentNav, samePhaseNext],
    });

    const html = await render();

    expect(html).not.toContain('href="/learn/1/2/9"');
    expect(html).toContain('href="/learn/1/2/11"');
  });

  it("trial のロック画面でも前後ナビが描画される", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: false,
      orderedContents: [currentNav, nextInPhase],
    });

    const html = await render();

    expect(html).toContain("このコンテンツは無料プランでは閲覧できません");
    expect(html).toContain('href="/learn/1/2/20"');
  });

  it("trial でロック済み（is_open_to_trial: false）コンテンツが遷移先になる", async () => {
    setup({
      userStatus: "trial",
      isOpenToTrial: true,
      orderedContents: [currentNav, lockedNext],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/21"');
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

      expect(html).toContain('href="/learn/1/2/40"');
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

  it("ナビ縮退時でも同じフェーズの次へは出る", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [],
      extraPhaseContents: [{ id: 11, title: "同じフェーズの次", display_order: 2 }],
    });

    const html = await render();

    expect(html).toContain('href="/learn/1/2/11"');
    expect(html).toContain("同じフェーズの次");
    expect(html).not.toContain("テーマに戻る");
    expect(html).not.toContain("フェーズに戻る");
  });

  it("通し列に現在が無い縮退時は フェーズに戻る（テーマ末尾と区別）", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: false,
      orderedContents: [nextInPhase],
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

describe("スライドの解説記事（#375）", () => {
  const article = "解説記事の本文";
  const storageArticle = "![図]({{SUPABASE_STORAGE_URL}}/thumbnails/a.png)";

  it("記事があるスライドはビューアの下に表示し、空ならスライドだけ", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({ text_content: article, description: "概要テスト本文" }),
      error: null,
    } as never);

    const html = await render();

    const slideIndex = html.indexOf('data-testid="slide-content"');
    const articleIndex = html.indexOf(article);
    const overviewIndex = html.indexOf("概要テスト本文");
    expect(slideIndex).toBeGreaterThanOrEqual(0);
    expect(articleIndex).toBeGreaterThan(slideIndex);
    expect(overviewIndex).toBeGreaterThan(articleIndex);

    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({ text_content: null }),
      error: null,
    } as never);
    const empty = await render();
    expect(empty).toContain('data-testid="slide-content"');
    expect(empty).not.toContain(article);
  });

  it("記事の {{SUPABASE_STORAGE_URL}} を置換する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({ text_content: storageArticle }),
      error: null,
    } as never);

    const html = await render();

    expect(html).toContain("https://project.supabase.co/storage/v1/object/public/thumbnails/a.png");
    expect(html).not.toContain("{{SUPABASE_STORAGE_URL}}");
  });

  it("未公開プレビューでも記事を表示する", async () => {
    setup({
      userStatus: "active",
      userRole: "admin",
      isOpenToTrial: false,
      isPublished: false,
    });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({ is_published: false, text_content: article }),
      error: null,
    } as never);

    const html = await render();

    expect(html).toContain(article);
    expect(html).toContain('data-testid="slide-content"');
  });

  it("テキスト種別の本文は従来どおり表示し、動画に残った本文は出さない", async () => {
    setup({ userStatus: "active", isOpenToTrial: true });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: {
        ...slideContent({ text_content: article }),
        content_type: "text",
        pdf_url: null,
      },
      error: null,
    } as never);

    const textHtml = await render();
    expect(textHtml).toContain(article);
    expect(textHtml).not.toContain('data-testid="slide-content"');

    vi.mocked(fetchContentById).mockResolvedValue({
      data: {
        ...slideContent({ text_content: article }),
        content_type: "video",
        video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        pdf_url: null,
      },
      error: null,
    } as never);
    const videoHtml = await render();
    expect(videoHtml).toContain('data-testid="youtube-embed"');
    expect(videoHtml).not.toContain(article);
  });
});

describe("Stream 動画の再生トークン発行（#488）", () => {
  const STREAM_UID = "0123456789abcdef0123456789abcdef";
  const videoContent = () => ({
    ...slideContent({}),
    content_type: "video",
    video_url: STREAM_UID,
    pdf_url: null,
  });

  it("閲覧権限があるときだけ UID で発行し、Stream プレイヤーを表示する", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({ data: videoContent(), error: null } as never);
    vi.mocked(createStreamPlaybackForMember).mockReturnValue({
      iframeSrc: "https://customer-x.cloudflarestream.com/TOKEN/iframe",
      thumbnailSrc: "https://customer-x.cloudflarestream.com/TOKEN/thumbnails/thumbnail.jpg",
    });

    const html = await render();

    expect(createStreamPlaybackForMember).toHaveBeenCalledWith(STREAM_UID);
    expect(html).toContain('data-testid="stream-embed"');
  });

  it("ロック中（お試しで非公開開放）は発行しない", async () => {
    setup({ userStatus: "trial", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({ data: videoContent(), error: null } as never);

    const html = await render();

    expect(createStreamPlaybackForMember).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="stream-embed"');
  });

  it("発行に失敗したら読み込めない旨を表示する", async () => {
    setup({ userStatus: "active", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({ data: videoContent(), error: null } as never);
    vi.mocked(createStreamPlaybackForMember).mockReturnValue(null);

    const html = await render();

    expect(html).toContain("動画を読み込めませんでした");
    expect(html).not.toContain('data-testid="youtube-embed"');
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
    expect(fetchUpgradePriceLabel).not.toHaveBeenCalled();
  });

  it("お試しでも公開コンテンツでは料金ラベルを表示に使わない", async () => {
    vi.stubEnv("STRIPE_ENABLED", "true");
    setup({ userStatus: "trial", isOpenToTrial: true });
    vi.mocked(fetchUpgradePriceLabel).mockResolvedValue("月額2,000円（税込）");

    const html = await render();

    expect(html).not.toContain("月額2,000円（税込）");
    expect(html).not.toContain('data-analytics-source="lock_screen"');
  });
});

describe("演習ページのAIレビュー残り回数（#304）", () => {
  const setupExercise = ({
    userStatus,
    isPublished = true,
    usage = { contentReviews: [], todayTotal: 0 },
  }: {
    userStatus: "active" | "trial";
    isPublished?: boolean;
    usage?: Awaited<ReturnType<typeof fetchAIReviewUsage>>;
  }) => {
    setup({ userStatus, userRole: "member", isOpenToTrial: true, isPublished });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({
        content_type: "exercise",
        pdf_url: null,
        exercise_instructions: "課題文",
        allowed_submission_types: "code",
        is_open_to_trial: true,
        is_published: isPublished,
      }),
      error: null,
    } as never);
    vi.mocked(fetchCompletedAIReviewByContentId).mockResolvedValue({ data: null } as never);
    vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({ data: null } as never);
    vi.mocked(fetchAIReviewUsage).mockResolvedValue(usage);
  };

  it("active: 日次合計も数え、この課題と1日全体の小さい方を残り回数として表示する", async () => {
    setupExercise({
      userStatus: "active",
      usage: {
        contentReviews: [
          { id: 1, submission_id: 1, status: "completed", created_at: new Date().toISOString() },
        ],
        todayTotal: 1,
      },
    });

    const html = await render();

    expect(fetchAIReviewUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 7, contentId: 10, includeDailyTotal: true })
    );
    expect(html).toContain("本日の残り回数: 1回");
  });

  it("trial: 残り回数を表示しないので回数集計を呼ばない", async () => {
    setupExercise({ userStatus: "trial" });

    const html = await render();

    expect(fetchAIReviewUsage).not.toHaveBeenCalled();
    expect(html).toContain("お試しプランでは AI レビューは 1 課題につき");
  });

  it("集計に失敗しても案内は表示し、残り回数だけを隠す", async () => {
    setupExercise({ userStatus: "active", usage: null });

    const html = await render();

    expect(html).toContain("AIレビューは新しい提出に対して1課題につき1日");
    expect(html).not.toContain("本日の残り回数");
  });

  it("模範回答は RPC が返したときだけ表示する（提出前は返らない）", async () => {
    setupExercise({ userStatus: "active" });
    vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({
      data: { id: 1, submission_type: "url", url: "https://example.com/work" },
    } as never);

    expect(await render()).not.toContain("模範回答");

    vi.mocked(fetchExerciseReferenceAnswer).mockResolvedValue({
      data: "const answer = 1;",
      error: null,
    });
    const html = await render();
    expect(html).toContain("模範回答");
    expect(html).toContain("const answer = 1;");
    expect(fetchExerciseReferenceAnswer).toHaveBeenCalledWith(expect.any(Number));
  });

  it("採点基準ありの演習は完了ボタンを出さず、合格の案内を出す", async () => {
    setupExercise({ userStatus: "trial" });
    vi.mocked(fetchExerciseReviewPassState).mockResolvedValue({
      requiresPass: true,
      passUnachievable: false,
      hasPassingReview: false,
    });

    const html = await render();

    expect(html).not.toContain('data-testid="complete-button"');
    expect(html).toContain("点以上・未達成の要件なし");
    expect(html).toContain("お試しの間はこの演習を完了できません");
    expect(html).not.toContain("修了証");
  });

  it("空の採点基準では合格点の案内を出さない", async () => {
    setupExercise({ userStatus: "active" });
    vi.mocked(fetchExerciseReviewPassState).mockResolvedValue({
      requiresPass: true,
      passUnachievable: true,
      hasPassingReview: false,
    });

    const html = await render();

    expect(html).toContain("現在この演習は完了できません");
    expect(html).not.toContain("点以上");
    expect(html).not.toContain('data-testid="complete-button"');
  });

  it("未公開（プレビュー）の演習では集計しない", async () => {
    setupExercise({ userStatus: "active", isPublished: false });
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "active",
      userRole: "admin",
    } as never);

    await render();

    expect(fetchAIReviewUsage).not.toHaveBeenCalled();
  });
});

describe("演習の再挑戦（#355）", () => {
  const setupExerciseWithSubmission = ({
    isPublished = true,
    retryStartedAt = null as string | null,
    submittedAt = "2026-10-01T11:00:00.000Z",
  }: {
    isPublished?: boolean;
    retryStartedAt?: string | null;
    submittedAt?: string;
  } = {}) => {
    setup({ userStatus: "active", userRole: "member", isOpenToTrial: true, isPublished });
    vi.mocked(fetchContentById).mockResolvedValue({
      data: slideContent({
        content_type: "exercise",
        pdf_url: null,
        exercise_instructions: "課題文",
        allowed_submission_types: "code",
        is_open_to_trial: true,
        is_published: isPublished,
      }),
      error: null,
    } as never);
    vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({
      data: {
        id: 99,
        submission_type: "url",
        url: "https://example.com/work",
        submitted_at: submittedAt,
      },
    } as never);
    vi.mocked(fetchExerciseReferenceAnswer).mockResolvedValue({
      data: "const answer = 1;",
      error: null,
    });
    vi.mocked(fetchCompletedAIReviewByContentId).mockResolvedValue({
      data: { id: 5, status: "completed", review_content: "良い提出です" },
      submissionId: 99,
    } as never);
    vi.mocked(fetchUserProgressByContentId).mockResolvedValue({
      isCompleted: false,
      retryStartedAt,
      error: null,
    });
    vi.mocked(fetchAIReviewUsage).mockResolvedValue({ contentReviews: [], todayTotal: 0 });
  };

  it("提出あり・再挑戦中でないとき模範回答と再挑戦ボタンを表示する", async () => {
    setupExerciseWithSubmission();

    const html = await render();

    expect(html).toContain("模範回答");
    expect(html).toContain("再度課題に取り組む");
    expect(html).toContain("AIレビュー結果");
    expect(html).not.toContain("再挑戦中です");
    expect(html).not.toContain("前回の提出内容を見る");
  });

  it("再挑戦中は模範回答と AI レビューを隠し、折りたたみと案内を出す", async () => {
    setupExerciseWithSubmission({
      retryStartedAt: "2026-10-01T12:00:00.000Z",
      submittedAt: "2026-10-01T11:00:00.000Z",
    });

    const html = await render();

    expect(html).toContain(
      "再挑戦中です。新しく提出すると模範回答と AI レビュー結果が表示されます"
    );
    expect(html).toContain("前回の提出内容を見る");
    // Notice text mentions 模範回答 / AI レビュー結果; assert the result block headings are gone.
    expect(html).not.toContain(">模範回答<");
    expect(html).not.toContain(">AIレビュー結果<");
    expect(html).not.toContain("再度課題に取り組む");
    expect(html).not.toContain("const answer = 1;");
  });

  it("再挑戦後に新しい提出があると結果を再表示する", async () => {
    setupExerciseWithSubmission({
      retryStartedAt: "2026-10-01T12:00:00.000Z",
      submittedAt: "2026-10-01T13:00:00.000Z",
    });

    const html = await render();

    expect(html).toContain("模範回答");
    expect(html).toContain("再度課題に取り組む");
    expect(html).not.toContain("再挑戦中です");
  });

  it("未公開プレビューでは再挑戦ボタンを出さない", async () => {
    setupExerciseWithSubmission({ isPublished: false });
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "active",
      userRole: "admin",
    } as never);

    const html = await render();

    expect(html).not.toContain("再度課題に取り組む");
  });

  it("提出が無い演習では再挑戦ボタンを出さない", async () => {
    setupExerciseWithSubmission();
    vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({ data: null } as never);
    vi.mocked(fetchExerciseReferenceAnswer).mockResolvedValue({ data: null, error: null });
    vi.mocked(fetchCompletedAIReviewByContentId).mockResolvedValue({
      data: null,
      submissionId: null,
    } as never);

    const html = await render();

    expect(html).not.toContain("再度課題に取り組む");
    expect(html).not.toContain("模範回答");
  });

  it("提出済み・再挑戦中でないときは課題提出の見出しを出さない (#406)", async () => {
    setupExerciseWithSubmission();

    const html = await render();

    expect(html).toContain("再度課題に取り組む");
    expect(html).not.toContain(">課題提出<");
  });

  it("再挑戦中は課題提出の見出しを出す (#406)", async () => {
    setupExerciseWithSubmission({
      retryStartedAt: "2026-10-01T12:00:00.000Z",
      submittedAt: "2026-10-01T11:00:00.000Z",
    });

    const html = await render();

    expect(html).toContain(">課題提出<");
  });

  it("未提出の演習では課題提出の見出しを出す (#406)", async () => {
    setupExerciseWithSubmission();
    vi.mocked(fetchLatestSubmissionByContentId).mockResolvedValue({ data: null } as never);
    vi.mocked(fetchExerciseReferenceAnswer).mockResolvedValue({ data: null, error: null });
    vi.mocked(fetchCompletedAIReviewByContentId).mockResolvedValue({
      data: null,
      submissionId: null,
    } as never);

    const html = await render();

    expect(html).toContain(">課題提出<");
  });

  it("未公開プレビューでは課題提出の見出しを出さない (#406)", async () => {
    setupExerciseWithSubmission({ isPublished: false });
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "active",
      userRole: "admin",
    } as never);

    const html = await render();

    expect(html).not.toContain(">課題提出<");
    expect(html).toContain("非公開コンテンツのプレビュー中は課題提出・AIレビューを利用できません");
  });
});

describe("パンくずの取得元（フェーズの二重取得をやめる）", () => {
  it("コンテンツが取得できるときは埋め込みのフェーズを使い、fetchPhaseWithBreadcrumbById を呼ばない", async () => {
    setup({ userStatus: "active", isOpenToTrial: true });

    const html = await render();

    expect(html).toContain("GAS");
    expect(fetchPhaseWithBreadcrumbById).not.toHaveBeenCalled();
  });

  it("お試しユーザーのロック画面（コンテンツが RLS で取得できない）は fetchPhaseWithBreadcrumbById にフォールバックする", async () => {
    setup({ userStatus: "trial", isOpenToTrial: false });
    vi.mocked(fetchContentById).mockResolvedValue({ data: null, error: null } as never);

    const html = await render();

    expect(fetchPhaseWithBreadcrumbById).toHaveBeenCalledWith(2, "member");
    expect(html).toContain("GAS");
  });

  it("埋め込みのフェーズが URL の phaseId と一致しない場合は 404", async () => {
    setup({
      userStatus: "active",
      isOpenToTrial: true,
      contentPhaseOverride: { ...phase, id: 99 },
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("コンテンツが見つからずフェーズも取れない場合は 404", async () => {
    setup({ userStatus: "active", isOpenToTrial: true });
    vi.mocked(fetchContentById).mockResolvedValue({ data: null, error: null } as never);
    vi.mocked(fetchPhaseWithBreadcrumbById).mockResolvedValue({ data: null, error: null } as never);

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("論理削除されたフェーズのコンテンツは admin でも 404（プレビュー扱いにしない）", async () => {
    setup({
      userStatus: "active",
      userRole: "admin",
      isOpenToTrial: true,
      contentPhaseOverride: { ...phase, is_deleted: true },
    });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
