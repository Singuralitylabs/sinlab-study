import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  acceptPreviewConsoleMessage,
  buildPreviewConsoleBridgeScript,
  injectPreviewConsoleBridge,
  PREVIEW_CONSOLE_MAX_ENTRIES,
  PREVIEW_CONSOLE_MAX_TEXT_LENGTH,
  PREVIEW_CONSOLE_MESSAGE_TYPE,
  parsePreviewConsoleMessage,
} from "@/app/lib/preview-console";

/** Runs the exact <script> body the iframe gets, against a fake window and console. */
function runBridge() {
  const postMessage = vi.fn();
  const listeners: Record<string, (event: unknown) => void> = {};
  const original = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const fakeConsole: Record<string, unknown> = { ...original };
  const fakeWindow = {
    parent: { postMessage },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
  };
  const script = buildPreviewConsoleBridgeScript();
  const body = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
  vm.runInNewContext(body, { window: fakeWindow, console: fakeConsole });
  const call = (method: string, ...args: unknown[]) =>
    (fakeConsole[method] as (...a: unknown[]) => void)(...args);
  const sent = () => postMessage.mock.calls.map(([message]) => message);
  return { postMessage, listeners, original, call, sent };
}

describe("previewConsoleBridge（iframe 内で動くスクリプト）", () => {
  it("console.log / warn / error を整形して親へ送り、元の console も呼ぶ", () => {
    const { postMessage, original, call, sent } = runBridge();
    call("log", "合計", 42, { a: 1 }, [1, 2], null, undefined);
    call("info", "info");
    call("warn", "注意");
    call("error", new TypeError("x is not a function"));

    expect(sent()).toEqual([
      {
        type: PREVIEW_CONSOLE_MESSAGE_TYPE,
        level: "log",
        text: '合計 42 {"a":1} [1,2] null undefined',
      },
      { type: PREVIEW_CONSOLE_MESSAGE_TYPE, level: "log", text: "info" },
      { type: PREVIEW_CONSOLE_MESSAGE_TYPE, level: "warn", text: "注意" },
      {
        type: PREVIEW_CONSOLE_MESSAGE_TYPE,
        level: "error",
        text: "TypeError: x is not a function",
      },
    ]);
    expect(postMessage.mock.calls.every(([, targetOrigin]) => targetOrigin === "*")).toBe(true);
    expect(original.log).toHaveBeenCalledWith("合計", 42, { a: 1 }, [1, 2], null, undefined);
    expect(original.warn).toHaveBeenCalledWith("注意");
  });

  it("循環参照のオブジェクトでも例外にせず送る", () => {
    const { call, sent } = runBridge();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => call("log", circular)).not.toThrow();
    expect(sent()[0].text).toBe("[object Object]");
  });

  it("未捕捉のエラーと Promise の拒否をエラーとして送る", () => {
    const { listeners, sent } = runBridge();
    listeners.error({ message: "Uncaught ReferenceError: foo is not defined" });
    listeners.unhandledrejection({ reason: new Error("boom") });
    expect(sent()).toEqual([
      expect.objectContaining({
        level: "error",
        text: "Uncaught ReferenceError: foo is not defined",
      }),
      expect.objectContaining({ level: "error", text: "Uncaught (in promise) Error: boom" }),
    ]);
  });

  it("長い行は上限の文字数に切り詰める", () => {
    const { call, sent } = runBridge();
    call("log", "a".repeat(PREVIEW_CONSOLE_MAX_TEXT_LENGTH * 3));
    const text = sent()[0].text as string;
    expect(text.length).toBe(PREVIEW_CONSOLE_MAX_TEXT_LENGTH);
    expect(parsePreviewConsoleMessage(sent()[0])).not.toBeNull();
  });

  it("送信は上限＋1件で止める（親が省略を判別できる分だけ送る）", () => {
    const { call, postMessage } = runBridge();
    for (let i = 0; i < PREVIEW_CONSOLE_MAX_ENTRIES + 50; i++) {
      call("log", i);
    }
    expect(postMessage).toHaveBeenCalledTimes(PREVIEW_CONSOLE_MAX_ENTRIES + 1);
  });

  it("親が居ない等で postMessage が投げても受講生のコードを止めない", () => {
    const { postMessage, call, original } = runBridge();
    postMessage.mockImplementation(() => {
      throw new Error("detached");
    });
    expect(() => call("log", "x")).not.toThrow();
    expect(original.log).toHaveBeenCalledWith("x");
  });
});

describe("injectPreviewConsoleBridge", () => {
  const bridge = buildPreviewConsoleBridgeScript();

  it("<head> の直後（受講生のスクリプトより前）に入れる", () => {
    const html =
      '<!doctype html><html><head><script src="a.js"></script></head><body></body></html>';
    const out = injectPreviewConsoleBridge(html);
    expect(out.startsWith(`<!doctype html><html><head>${bridge}<script`)).toBe(true);
  });

  it("<header> を <head> と取り違えない", () => {
    const out = injectPreviewConsoleBridge("<!DOCTYPE html><body><header>h</header></body>");
    expect(out).toBe(`<!DOCTYPE html>${bridge}<body><header>h</header></body>`);
  });

  it("<head> が無ければ doctype の直後、doctype も無ければ先頭に入れる", () => {
    expect(injectPreviewConsoleBridge("<!doctype html><p>x</p>")).toBe(
      `<!doctype html>${bridge}<p>x</p>`
    );
    expect(injectPreviewConsoleBridge("<p>x</p><script>1</script>")).toBe(
      `${bridge}<p>x</p><script>1</script>`
    );
  });

  it('<head> が無い文書で、学習者のスクリプト内の文字列 "<head>" に差し込まない', () => {
    const html = '<body><script>const s = "<head>";</script></body>';
    expect(injectPreviewConsoleBridge(html)).toBe(`${bridge}${html}`);
  });

  it("コメント・<style> の中の <head> は読み飛ばし、本物の <head> の直後に入れる", () => {
    const html =
      "<!doctype html><!-- <head> --><style>/* <head> */</style><html><head><title>t</title></head></html>";
    expect(injectPreviewConsoleBridge(html)).toBe(
      `<!doctype html><!-- <head> --><style>/* <head> */</style><html><head>${bridge}<title>t</title></head></html>`
    );
  });

  it("<body> より後に現れる <head> は使わない", () => {
    const html = "<!doctype html><body><p>&lt;head&gt;</p><head></head></body>";
    expect(injectPreviewConsoleBridge(html)).toBe(
      `<!doctype html>${bridge}<body><p>&lt;head&gt;</p><head></head></body>`
    );
  });

  it("差し込むスクリプトは途中で閉じタグを含まない", () => {
    expect(bridge.match(/<\/script/gi)).toHaveLength(1);
  });
});

describe("parsePreviewConsoleMessage", () => {
  const valid = { type: PREVIEW_CONSOLE_MESSAGE_TYPE, level: "log", text: "hi" };

  it("正しい形式だけを受け付け、余分なプロパティは捨てる", () => {
    expect(parsePreviewConsoleMessage({ ...valid, extra: "<img>" })).toEqual({
      level: "log",
      text: "hi",
    });
  });

  it.each([
    ["null", null],
    ["文字列", "hi"],
    ["type 違い", { ...valid, type: "other" }],
    ["未知の level", { ...valid, level: "table" }],
    ["text が文字列でない", { ...valid, text: { toString: (): string => "x" } }],
    ["text が長すぎる", { ...valid, text: "a".repeat(PREVIEW_CONSOLE_MAX_TEXT_LENGTH + 1) }],
  ])("%s は無視する", (_label, data) => {
    expect(parsePreviewConsoleMessage(data)).toBeNull();
  });
});

describe("acceptPreviewConsoleMessage（送信元の検証）", () => {
  const data = { type: PREVIEW_CONSOLE_MESSAGE_TYPE, level: "error", text: "x" };
  const frameWindow = { name: "our frame" };

  it("自分の iframe の window からのメッセージだけを受け付ける", () => {
    expect(acceptPreviewConsoleMessage({ source: frameWindow, data }, frameWindow)).toEqual({
      level: "error",
      text: "x",
    });
  });

  it("形式が正しくても他の iframe・ページ・親自身からのメッセージは無視する（偽装対策）", () => {
    const otherFrame = { name: "another preview" };
    const parentWindow = { name: "parent" };
    expect(acceptPreviewConsoleMessage({ source: otherFrame, data }, frameWindow)).toBeNull();
    expect(acceptPreviewConsoleMessage({ source: parentWindow, data }, frameWindow)).toBeNull();
    expect(acceptPreviewConsoleMessage({ source: null, data }, frameWindow)).toBeNull();
  });

  it("iframe が無い（閉じている・作り直し中）ときは何も受け付けない", () => {
    expect(acceptPreviewConsoleMessage({ source: null, data }, null)).toBeNull();
    expect(acceptPreviewConsoleMessage({ source: undefined, data }, undefined)).toBeNull();
  });

  it("自分の iframe からでも形式が不正なら無視する", () => {
    expect(
      acceptPreviewConsoleMessage(
        { source: frameWindow, data: { ...data, level: "x" } },
        frameWindow
      )
    ).toBeNull();
  });
});
