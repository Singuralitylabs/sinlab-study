import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 未認証のデモ画面では、お試し公開（is_open_to_trial = true）のスライドに限って
// 署名付きURLを発行することをページ単位で検証する（issue #89）。

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/services/api/demo-learning-server");
vi.mock("@/app/components/SlideContent", () => ({
  SlideContent: ({ signedUrl }: { signedUrl: string | null }) =>
    createElement("div", { "data-testid": "slide-content" }, signedUrl ?? "SLIDE_UNAVAILABLE"),
}));
vi.mock("@/app/components/YouTubeEmbed", () => ({ YouTubeEmbed: () => null }));
vi.mock("@/app/demo/components/DemoCompleteButton", () => ({ DemoCompleteButton: () => null }));
vi.mock("@/app/demo/components/DemoSubmissionForm", () => ({ DemoSubmissionForm: () => null }));

import DemoContentPage from "@/app/demo/[themeId]/[phaseId]/[weekId]/[contentId]/page";
import {
  createDemoSlideSignedUrl,
  fetchDemoContentById,
  fetchDemoContentsByWeekId,
  fetchDemoContext,
} from "@/app/services/api/demo-learning-server";

const SIGNED_URL =
  "https://project.supabase.co/storage/v1/object/sign/slides/gas/slide-01.pdf?token=x";
const PDF_KEY = "gas/slide-01.pdf";

const params = Promise.resolve({ themeId: "1", phaseId: "2", weekId: "3", contentId: "10" });

const theme = { id: 1, name: "GAS" };
const phase = { id: 2, theme_id: 1, name: "フェーズ1", theme };
const week = { id: 3, phase_id: 2, name: "第1週", phase };

const setup = ({ isOpenToTrial }: { isOpenToTrial: boolean }) => {
  const content = {
    id: 10,
    week_id: 3,
    title: "基礎文法（スライド）",
    content_type: "slide",
    pdf_url: PDF_KEY,
    description: null,
    is_published: true,
    is_deleted: false,
    is_open_to_trial: isOpenToTrial,
    week,
  };
  vi.mocked(fetchDemoContentById).mockResolvedValue({ data: content, error: null } as never);
  vi.mocked(fetchDemoContext).mockResolvedValue({
    data: { theme, phase, week },
    error: null,
  } as never);
  vi.mocked(fetchDemoContentsByWeekId).mockResolvedValue({ data: [content], error: null } as never);
  vi.mocked(createDemoSlideSignedUrl).mockResolvedValue(SIGNED_URL);
};

const render = async () => renderToStaticMarkup(await DemoContentPage({ params }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("デモ画面のスライド配信（署名付きURL）", () => {
  it("お試し公開スライドは署名付きURLを発行して表示する", async () => {
    setup({ isOpenToTrial: true });

    const html = await render();

    expect(createDemoSlideSignedUrl).toHaveBeenCalledTimes(1);
    expect(createDemoSlideSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ pdf_url: PDF_KEY, is_open_to_trial: true })
    );
    expect(html).toContain(SIGNED_URL);
  });

  it("お試し非公開スライドは署名付きURLを発行せず、対象外である旨を表示する", async () => {
    setup({ isOpenToTrial: false });

    const html = await render();

    expect(createDemoSlideSignedUrl).not.toHaveBeenCalled();
    expect(html).not.toContain(SIGNED_URL);
    expect(html).not.toContain(PDF_KEY);
    expect(html).toContain("このスライドはお試し公開の対象外です");
  });
});
