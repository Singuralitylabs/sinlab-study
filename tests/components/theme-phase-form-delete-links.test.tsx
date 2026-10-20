/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhaseForm } from "@/app/(authenticated)/manage/(content)/phases/PhaseForm";
import { ThemeForm } from "@/app/(authenticated)/manage/(content)/themes/ThemeForm";
import type { LearningPhase, LearningTheme } from "@/app/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => createElement("img", { alt: props.alt ?? "" }),
}));

const theme: LearningTheme = {
  id: 3,
  name: "テーマ編集",
  description: null,
  image_url: null,
  hero_image_url: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  created_at: null,
  updated_at: null,
};

const phase: LearningPhase = {
  id: 7,
  theme_id: 3,
  name: "フェーズ編集",
  description: null,
  display_order: 1,
  is_published: true,
  is_deleted: false,
  created_at: null,
  updated_at: null,
};

describe("ThemeForm / PhaseForm delete links (#465)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("編集モードの ThemeForm に削除確認ページへのリンクがある", async () => {
    await act(async () => {
      root.render(<ThemeForm initialData={theme} siblings={[]} mode="edit" />);
    });

    const link = container.querySelector('a[href="/manage/themes/3/delete"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("削除");
  });

  it("作成モードや embedded の ThemeForm には削除リンクがない", async () => {
    await act(async () => {
      root.render(<ThemeForm siblings={[]} mode="create" />);
    });
    expect(container.querySelector('a[href*="/delete"]')).toBeNull();

    await act(async () => {
      root.render(<ThemeForm initialData={theme} siblings={[]} mode="edit" embedded />);
    });
    expect(container.querySelector('a[href*="/delete"]')).toBeNull();
  });

  it("編集モードの PhaseForm に削除確認ページへのリンクがある", async () => {
    await act(async () => {
      root.render(
        <PhaseForm
          themes={[
            {
              id: 3,
              name: "テーマ",
              description: null,
              image_url: null,
              display_order: 1,
              is_published: true,
            },
          ]}
          initialData={phase}
          siblingCandidates={[]}
          mode="edit"
        />
      );
    });

    const link = container.querySelector('a[href="/manage/phases/7/delete"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("削除");
  });
});
