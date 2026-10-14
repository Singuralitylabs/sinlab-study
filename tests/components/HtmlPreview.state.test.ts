// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlPreview } from "@/app/components/HtmlPreview";
import {
  PREVIEW_CONSOLE_MAX_ENTRIES,
  PREVIEW_CONSOLE_MESSAGE_TYPE,
} from "@/app/lib/preview-console";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Inert code: these tests drive the console list by posting messages themselves.
const filesWith = (content: string) => [{ filename: "main.js", language: "javascript", content }];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (content = "// a") =>
  act(() => root.render(createElement(HtmlPreview, { files: filesWith(content) })));
const iframe = () => container.querySelector("iframe") as HTMLIFrameElement;
const lines = () => [...container.querySelectorAll("ol li")].map((li) => li.textContent);
const line = (text: string, level = "log") => ({ type: PREVIEW_CONSOLE_MESSAGE_TYPE, level, text });
const post = (data: unknown, source: unknown = iframe().contentWindow) =>
  window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }));
/** Lets the requestAnimationFrame flush (and the 300ms debounce, when asked) run. */
const settle = (ms = 50) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("HtmlPreview（コンソールの受信と実行ごとの作り直し）", () => {
  it("自分の iframe からの正しい形式のメッセージだけを一覧に出す", async () => {
    await render();
    post(line("hi"));
    post(line("boom", "error"));
    post(line("from elsewhere"), window);
    post(line("from another frame"), {});
    post({ type: PREVIEW_CONSOLE_MESSAGE_TYPE, level: "table", text: "bad level" });
    await settle();
    expect(lines()).toEqual(["hi", "boom"]);
  });

  it("同じフレーム内の複数行はまとめて反映され、上限を超えたら 200 行と省略の注記を出す", async () => {
    await render();
    for (let i = 0; i < PREVIEW_CONSOLE_MAX_ENTRIES + 30; i++) {
      post(line(String(i)));
    }
    expect(lines()).toEqual([]);
    await settle();
    const shown = lines();
    expect(shown).toHaveLength(PREVIEW_CONSOLE_MAX_ENTRIES + 1);
    expect(shown[PREVIEW_CONSOLE_MAX_ENTRIES - 1]).toBe(String(PREVIEW_CONSOLE_MAX_ENTRIES - 1));
    expect(shown[PREVIEW_CONSOLE_MAX_ENTRIES]).toContain("省略しました");
  });

  it("再読み込みで iframe を作り直して一覧を空にし、古い iframe からのメッセージは受け付けない", async () => {
    await render();
    post(line("before"));
    await settle();
    const oldFrame = iframe();
    const oldWindow = oldFrame.contentWindow;

    const reload = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("再読み込み")
    ) as HTMLButtonElement;
    await act(() => reload.click());

    expect(iframe()).not.toBe(oldFrame);
    expect(lines()).toEqual([]);
    post(line("stale"), oldWindow);
    post(line("after"));
    await settle();
    expect(lines()).toEqual(["after"]);
  });

  it("コードが変わると（デバウンス後に）一度だけ作り直して一覧を空にする", async () => {
    await render("// a");
    post(line("old run"));
    await settle();
    const oldFrame = iframe();

    await render("// b");
    expect(iframe()).toBe(oldFrame);
    await settle(400);
    const newFrame = iframe();
    expect(newFrame).not.toBe(oldFrame);
    expect(newFrame.getAttribute("srcdoc")).toContain("// b");
    expect(lines()).toEqual([]);

    await render("// b");
    await settle(400);
    expect(iframe()).toBe(newFrame);
  });

  it("アンマウント時に未反映の行のフレームを取り消す", async () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    await render();
    post(line("pending"));
    act(() => root.unmount());
    expect(cancel).toHaveBeenCalled();
    root = createRoot(container);
  });
});
