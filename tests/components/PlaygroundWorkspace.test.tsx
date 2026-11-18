/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/CodeEditorNoSSR", () => ({
  CodeEditorNoSSR: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/app/components/playground/PlaygroundRunPanel", () => ({
  PlaygroundRunPanel: ({ files }: { files: { filename: string }[] }) => (
    <div data-testid="run">{files.map((f) => f.filename).join(",")}</div>
  ),
}));

import { PlaygroundWorkspace } from "@/app/(authenticated)/playground/components/PlaygroundWorkspace";
import { PLAYGROUND_SAVE_DEBOUNCE_MS } from "@/app/constants/playground";
import { playgroundStorageKey, serializePlaygroundDraft } from "@/app/lib/playground";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function editor() {
  return container.querySelector<HTMLTextAreaElement>('[data-testid="editor"]');
}

function type(value: string) {
  const textarea = editor();
  if (!textarea) {
    throw new Error("editor not rendered");
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label)
  );
  if (!button) {
    throw new Error(`button ${label} not found`);
  }
  act(() => button.click());
}

describe("PlaygroundWorkspace", () => {
  it("書いたコードを、ユーザーごとのキーで保存する", () => {
    act(() => root.render(<PlaygroundWorkspace userId={7} />));
    expect(editor()?.value).toContain("<!DOCTYPE html>");

    type("<p>hello</p>");
    act(() => vi.advanceTimersByTime(PLAYGROUND_SAVE_DEBOUNCE_MS));

    const saved = window.localStorage.getItem(playgroundStorageKey(7, { kind: "web" }));
    expect(saved).toContain("<p>hello</p>");
    expect(window.localStorage.getItem(playgroundStorageKey(8, { kind: "web" }))).toBeNull();
    expect(container.textContent).toContain("保存しました");
  });

  it("別のユーザーには前のユーザーのコードを出さない", () => {
    window.localStorage.setItem(
      playgroundStorageKey(7, { kind: "python" }),
      serializePlaygroundDraft([{ filename: "main.py", content: "print('secret')" }])
    );
    act(() => root.render(<PlaygroundWorkspace userId={8} />));
    clickButton("Python");
    expect(editor()?.value).not.toContain("secret");

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<PlaygroundWorkspace userId={7} />));
    clickButton("Python");
    expect(editor()?.value).toBe("print('secret')");
  });

  it("種類を切り替える前に、書きかけのコードを保存する", () => {
    act(() => root.render(<PlaygroundWorkspace userId={7} />));
    clickButton("Python");
    type("print(1)");
    clickButton("SQL");
    expect(window.localStorage.getItem(playgroundStorageKey(7, { kind: "python" }))).toContain(
      "print(1)"
    );
  });

  it("ひな形のリンクでは、ひな形の内容で始まり、戻すとひな形に戻る", () => {
    const template = {
      slug: "abcdefghij",
      kind: "python" as const,
      files: [{ filename: "main.py", content: "print('template')" }],
    };
    act(() => root.render(<PlaygroundWorkspace userId={7} template={template} />));
    expect(editor()?.value).toBe("print('template')");
    expect(container.textContent).not.toContain("SQL");

    type("print('mine')");
    act(() => vi.advanceTimersByTime(PLAYGROUND_SAVE_DEBOUNCE_MS));
    expect(
      window.localStorage.getItem(playgroundStorageKey(7, { templateSlug: "abcdefghij" }))
    ).toContain("mine");

    clickButton("ひな形に戻す");
    clickButton("戻す");
    expect(editor()?.value).toBe("print('template')");
    expect(
      window.localStorage.getItem(playgroundStorageKey(7, { templateSlug: "abcdefghij" }))
    ).toBeNull();
  });

  it("保存できない環境でも動き続け、そのことを表示する", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    act(() => root.render(<PlaygroundWorkspace userId={7} />));
    type("<p>x</p>");
    act(() => vi.advanceTimersByTime(PLAYGROUND_SAVE_DEBOUNCE_MS));
    expect(editor()?.value).toBe("<p>x</p>");
    expect(container.textContent).toContain("保存できませんでした");
    setItem.mockRestore();
  });
});
