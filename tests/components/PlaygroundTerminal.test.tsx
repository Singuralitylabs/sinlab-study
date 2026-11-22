/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlaygroundTerminal } from "@/app/components/playground/PlaygroundTerminal";

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

function input() {
  const element = container.querySelector<HTMLInputElement>("#playground-terminal-input");
  if (!element) {
    throw new Error("input not rendered");
  }
  return element;
}

function typeAndEnter(line: string) {
  const element = input();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(element, line);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

function log() {
  return container.querySelector('[role="log"]')?.textContent ?? "";
}

describe("PlaygroundTerminal", () => {
  it("左のファイルをホームに置き、入力したコマンドの結果を出す", () => {
    act(() =>
      root.render(<PlaygroundTerminal files={[{ filename: "memo.txt", content: "りんご\n" }]} />)
    );
    typeAndEnter("cat memo.txt");
    expect(log()).toContain("sinlab:~$ cat memo.txt");
    expect(log()).toContain("りんご");

    typeAndEnter("mkdir work");
    typeAndEnter("cd work");
    expect(container.textContent).toContain("sinlab:~/work$");

    typeAndEnter("sudo ls");
    expect(log()).toContain("このターミナルでは使えません");
  });

  it("やり直すと、ファイルと場所が最初に戻る", () => {
    act(() =>
      root.render(<PlaygroundTerminal files={[{ filename: "memo.txt", content: "x\n" }]} />)
    );
    typeAndEnter("rm memo.txt");
    typeAndEnter("mkdir a");
    typeAndEnter("cd a");
    const restart = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("やり直す")
    );
    act(() => restart?.click());
    expect(container.textContent).toContain("sinlab:~$");
    typeAndEnter("ls");
    expect(log()).toContain("memo.txt");
  });
});
