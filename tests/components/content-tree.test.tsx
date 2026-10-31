/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentTree } from "@/app/(authenticated)/manage/(content)/contents/ContentTree";
import type { ContentTreeThemeNode } from "@/app/lib/content-tree";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const tree: ContentTreeThemeNode[] = [
  {
    id: 1,
    name: "テーマ1",
    isPublished: true,
    displayOrder: 1,
    phases: [
      {
        id: 10,
        themeId: 1,
        name: "フェーズ1",
        isPublished: true,
        displayOrder: 1,
        contents: [],
      },
    ],
  },
];

const ready = { themes: true, phases: true, contents: true };

describe("ContentTree delete links (#465)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    sessionStorage.clear();
  });

  it("テーマとフェーズの削除確認ページへのリンクがある", async () => {
    await act(async () => {
      root.render(
        <ContentTree
          tree={tree}
          themes={[]}
          themeSiblings={[]}
          phaseSiblingCandidates={[]}
          contentSiblingCandidates={[]}
          contentFormThemes={[]}
          contentFormPhases={[]}
          formDataReady={ready}
          initialExpandKeys={["theme:1"]}
        />
      );
    });

    const themeDelete = container.querySelector('a[href="/manage/themes/1/delete"]');
    const phaseDelete = container.querySelector('a[href="/manage/phases/10/delete"]');
    expect(themeDelete).toBeTruthy();
    expect(themeDelete?.getAttribute("title")).toBe("削除");
    expect(phaseDelete).toBeTruthy();
    expect(phaseDelete?.getAttribute("title")).toBe("削除");
  });
});

describe("ContentTree expand state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    sessionStorage.clear();
  });

  it("トグル後に sessionStorage があっても再描画ループにならない", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    await act(async () => {
      root.render(
        <ContentTree
          tree={tree}
          themes={[]}
          themeSiblings={[]}
          phaseSiblingCandidates={[]}
          contentSiblingCandidates={[]}
          contentFormThemes={[]}
          contentFormPhases={[]}
          formDataReady={ready}
        />
      );
    });

    const toggle = container.querySelector("button[aria-expanded]");
    expect(toggle).toBeTruthy();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const readsAfterToggle = getItem.mock.calls.length;

    // Allow a few animation/layout ticks; a loop would explode the call count.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getItem.mock.calls.length - readsAfterToggle).toBeLessThan(5);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    getItem.mockRestore();
  });
});
