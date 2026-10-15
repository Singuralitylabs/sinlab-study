// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewNoteMemoField } from "@/app/components/ReviewNoteEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ note: {} }),
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function blur(textarea: HTMLTextAreaElement) {
  // React 17+ delegates onBlur via bubbling focusout.
  textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

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
    if (!textarea) throw new Error("missing textarea");

    await act(() => {
      setTextareaValue(textarea, "x");
    });

    await act(async () => {
      blur(textarea);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      contentId: 1,
      requirementKey: "r1",
      memo: "x",
    });

    await act(() => {
      setTextareaValue(textarea, "");
    });

    await act(async () => {
      blur(textarea);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).memo).toBeNull();
  });
});
