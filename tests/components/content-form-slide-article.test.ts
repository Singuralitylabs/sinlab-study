// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));

import { ContentForm } from "@/app/(authenticated)/manage/(content)/contents/ContentForm";
import type { LearningContent } from "@/app/types";

const phases = [{ id: 2, name: "フェーズ", themeId: 1 }];
const themes = [{ id: 1, name: "テーマ" }];

const slide = {
  id: 10,
  phase_id: 2,
  title: "基礎文法",
  content_type: "slide",
  text_content: "既存の解説",
  pdf_url: "gas/slide-01.pdf",
  description: "",
  is_published: false,
  is_open_to_trial: false,
} as LearningContent;

const textContent = {
  ...slide,
  content_type: "text",
  text_content: "本文",
  pdf_url: null,
} as LearningContent;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const renderForm = async (initialData: LearningContent) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(ContentForm, {
        themes,
        phases,
        initialData,
        mode: "edit",
        siblingCandidates: [],
      })
    );
  });
};

const clickType = async (label: string) => {
  const button = [...(container?.querySelectorAll("button") ?? [])].find(
    (element) => element.textContent === label
  );
  if (!button) {
    throw new Error(`種別ボタンが見つかりません: ${label}`);
  }
  await act(async () => {
    button.click();
  });
};

const submit = async () => {
  const form = container?.querySelector("form");
  if (!form) {
    throw new Error("form が見つかりません");
  }
  await act(async () => {
    form.requestSubmit();
  });
};

const submittedBody = () => {
  const fetchMock = vi.mocked(fetch);
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init && "body" in init ? init.body : "")) as {
    content_type: string;
    text_content: string | null;
  };
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, storageRemoved: true }),
    })
  );
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("ContentForm の解説記事（#375）", () => {
  it("スライドでは解説記事を任意入力でき、送信ボディに載せる", async () => {
    await renderForm(slide);

    expect(container?.textContent).toContain("解説記事（Markdown・任意）");
    const field = container?.querySelector("#textContent");
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    expect((field as HTMLTextAreaElement).value).toBe("既存の解説");

    await submit();

    expect(submittedBody()).toEqual(
      expect.objectContaining({ content_type: "slide", text_content: "既存の解説" })
    );
  });

  it("空白だけの解説記事は null で送る", async () => {
    await renderForm({ ...slide, text_content: "   " } as LearningContent);

    await submit();

    expect(submittedBody().text_content).toBeNull();
  });

  it("テキスト種別は本文を送り、スライド以外へ変えると null にする", async () => {
    await renderForm(textContent);
    expect(container?.textContent).toContain("テキスト（Markdown）");
    expect(container?.textContent).not.toContain("解説記事（Markdown・任意）");

    await submit();
    expect(submittedBody()).toEqual(
      expect.objectContaining({ content_type: "text", text_content: "本文" })
    );

    vi.mocked(fetch).mockClear();
    await clickType("動画");
    expect(container?.textContent).not.toContain("解説記事は削除されます");
    await submit();
    expect(submittedBody()).toEqual(
      expect.objectContaining({ content_type: "video", text_content: null })
    );
  });

  it("スライドから記事が消える種別へ切り替えると注意を出し、テキストへは出さない", async () => {
    await renderForm(slide);

    await clickType("テキスト");
    expect(container?.textContent).not.toContain("解説記事は削除されます");
    await submit();
    expect(submittedBody()).toEqual(
      expect.objectContaining({ content_type: "text", text_content: "既存の解説" })
    );

    vi.mocked(fetch).mockClear();
    await clickType("スライド（PDF）");
    await clickType("動画");
    expect(container?.textContent).toContain("解説記事は削除されます");
    await submit();
    expect(submittedBody()).toEqual(
      expect.objectContaining({ content_type: "video", text_content: null })
    );
  });
});
