// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewNoteMemoField } from "@/app/components/ReviewNoteEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ note: {} }),
    })
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReviewNoteMemoField", () => {
  it("保存後に初期 props へ戻しても、lastSaved と異なれば再保存する", async () => {
    await act(() =>
      root.render(
        createElement(ReviewNoteMemoField, {
          contentId: 1,
          requirementKey: "r1",
          initialMemo: "",
        })
      )
    );

    const textarea = container.querySelector("textarea");
    expect(textarea).toBeTruthy();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(textarea, "x");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      textarea?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(textarea, "");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      textarea?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(secondBody.memo).toBeNull();
  });
});
