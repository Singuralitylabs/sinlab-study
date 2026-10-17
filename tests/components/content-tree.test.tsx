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
    phases: [],
  },
];

const ready = { themes: true, phases: true, weeks: true, contents: true };

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
          phases={[]}
          themeSiblings={[]}
          phaseSiblingCandidates={[]}
          weekSiblingCandidates={[]}
          contentSiblingCandidates={[]}
          contentFormThemes={[]}
          contentFormPhases={[]}
          contentFormWeeks={[]}
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
