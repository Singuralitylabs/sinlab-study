import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  acceptPreviewConsoleMessage,
  buildPreviewConsoleBridgeScript,
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
  const context = vm.createContext({ window: fakeWindow, console: fakeConsole });
  vm.runInContext(body, context);
  const call = (method: string, ...args: unknown[]) =>
    (fakeConsole[method] as (...a: unknown[]) => void)(...args);
  // Values made inside the context share its realm, as the learner's values share the iframe's.
  const run = (code: string) => vm.runInContext(code, context);
  const sent = () => postMessage.mock.calls.map(([message]) => message);
  const texts = () => sent().map((message) => message.text);
  return { postMessage, listeners, original, call, run, sent, texts };
}

describe("previewConsoleBridge（iframe 内で動くスクリプト）", () => {
  it("console.log / warn / error を整形して親へ送り、元の console も呼ぶ", () => {
    const { postMessage, original, call, run, sent } = runBridge();
    run('console.log("合計", 42, { a: 1 }, [1, 2], null, undefined)');
    call("info", "info");
    call("warn", "注意");
    call("error", new TypeError("x is not a function"));

    expect(sent()).toEqual([
      {
        type: PREVIEW_CONSOLE_MESSAGE_TYPE,
        level: "log",
        text: "合計 42 {a: 1} [1, 2] null undefined",
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
    expect(original.log).toHaveBeenCalledWith(
      "合計",
      42,
      expect.anything(),
      expect.anything(),
      null,
      undefined
    );
    expect(original.warn).toHaveBeenCalledWith("注意");
  });

  it("循環参照のオブジェクトでも例外にせず送る", () => {
    const { run, sent } = runBridge();
    expect(() => run("const c = {}; c.self = c; console.log(c)")).not.toThrow();
    expect(sent()[0].text).toBe("{self: [Circular]}");
  });

  it("DOM 要素・Map / Set・クラスのインスタンス・関数を {} ではなく要約で送る", () => {
    const { run, texts } = runBridge();
    run(`
      console.log({ nodeType: 1, nodeName: "DIV", tagName: "DIV", id: "x", className: "box" });
      console.log({ nodeType: 3, nodeName: "#text", data: "hi" });
      console.log(new Map([["a", 1]]), new Set([1, 2]));
      class Point { constructor() { this.x = 1; } }
      console.log(new Point(), new (class Empty {})());
      console.log(function greet() {}, () => {});
      console.log(/a+/g, new Date(0));
    `);
    expect(texts()).toEqual([
      '<div id="x" class="box">',
      '#text "hi"',
      'Map(1) {"a" => 1} Set(2) {1, 2}',
      "Point {x: 1} Empty {}",
      "ƒ greet() ƒ anonymous()",
      `/a+/g ${run("String(new Date(0))")}`,
    ]);
  });

  it("配列・オブジェクト・Map・NodeList の中の DOM 要素やエラーも {} にせず要約する", () => {
    const { run, texts } = runBridge();
    run(`
      const li = (id) => ({ nodeType: 1, nodeName: "LI", tagName: "LI", id: id, className: "" });
      class NodeList {
        constructor() { this[0] = li("a"); this[1] = li("b"); this.length = 2; }
        get [Symbol.toStringTag]() { return "NodeList"; }
      }
      console.log(new NodeList());
      console.log([li("a")], { el: li("b"), err: new Error("x"), fn() {} });
      console.log(new Map([["k", li("c")]]));
    `);
    expect(texts()).toEqual([
      'NodeList(2) [<li id="a">, <li id="b">]',
      '[<li id="a">] {el: <li id="b">, err: Error: x, fn: ƒ fn()}',
      'Map(1) {"k" => <li id="c">}',
    ]);
  });

  it("互いを参照するインスタンスでも再帰が止まる", () => {
    const { run, texts } = runBridge();
    expect(() =>
      run(`
        class A {} class B {}
        const a = new A(); const b = new B(); a.b = b; b.a = a;
        console.log(a);
      `)
    ).not.toThrow();
    expect(texts()[0]).toMatch(/^A /);
  });

  it("入れ子の BigInt・空文字のキー・自己参照する window も読める形で送る", () => {
    const { run, texts } = runBridge();
    run(`
      console.log({ n: 1n, list: [2n] });
      console.log({ "": { nodeType: 1, nodeName: "P", tagName: "P", id: "", className: "" } });
      const w = { name: "win" }; w.window = w; w.self = w;
      console.log(w, { top: w });
    `);
    expect(texts()).toEqual(["{n: 1n, list: [2n]}", '{"": <p>}', "Window {top: Window}"]);
  });

  it("共有参照の多い大きな構造でも、全体を組み立てずに文字数の上限で打ち切る", () => {
    const { run, texts } = runBridge();
    run(`
      class G { constructor() { this.nodes = []; } }
      class Nd { constructor(g, i) { this.g = g; this.i = i; this.peers = g.nodes; } }
      var g = new G();
      for (let i = 0; i < 2000; i++) g.nodes.push(new Nd(g, i));
      class T { constructor(d) { this.k = d > 0 ? Array.from({ length: 30 }, () => new T(d - 1)) : []; } }
      var t = new T(3);
    `);
    // Only the printing is timed; building 27,000 objects above is not the bridge's cost.
    const startedAt = Date.now();
    run("console.log(g); console.log(t);");
    expect(Date.now() - startedAt).toBeLessThan(500);
    const [graph, tree] = texts();
    expect(graph).toMatch(/^G \{nodes: \[Nd \{g: \[Circular\], i: 0, peers: \[Circular\]\}, /);
    expect(graph.endsWith("…")).toBe(true);
    expect(tree).toMatch(/^T \{k: \[T \{k: Array\(30\)\}, /);
    for (const text of [graph, tree]) {
      expect(text.length).toBeLessThanOrEqual(PREVIEW_CONSOLE_MAX_TEXT_LENGTH);
    }
  });

  it("大きな型付き配列・Map・Set も要素数に比例せず、上限で打ち切る", () => {
    const { run, texts } = runBridge();
    run(`
      var bytes = new Uint8Array(5e7);
      var floats = new Float64Array(3e6);
      var map = new Map(); for (let i = 0; i < 1e6; i++) map.set(i, i);
      var set = new Set(map.keys());
    `);
    const startedAt = Date.now();
    run("console.log(bytes); console.log(floats); console.log(map); console.log(set);");
    expect(Date.now() - startedAt).toBeLessThan(500);
    const [b, f, m, st] = texts();
    expect(b).toMatch(/^Uint8Array\(50000000\) \[0, 0, /);
    expect(f).toMatch(/^Float64Array\(3000000\) \[0, 0, /);
    expect(m).toMatch(/^Map\(1000000\) \{0 => 0, 1 => 1, /);
    expect(st).toMatch(/^Set\(1000000\) \{0, 1, /);
    for (const text of [b, f, m, st]) {
      expect(text.length).toBeLessThanOrEqual(PREVIEW_CONSOLE_MAX_TEXT_LENGTH);
      expect(text.endsWith("…")).toBe(true);
    }
  });

  it("console.log(...大きな配列) でも1回の呼び出し全体で上限を共有し、残りの引数を整形しない", () => {
    const { run, texts } = runBridge();
    run(`
      var objects = Array.from({ length: 30000 }, () => ({ a: "x".repeat(50), b: [1, 2, 3, { c: 4 }] }));
      var buffers = Array.from({ length: 30000 }, () => new Uint8Array(1000));
      var numbers = new Array(30000).fill(1);
    `);
    const startedAt = Date.now();
    run(
      "console.log(...objects); console.log(...buffers); console.log(...numbers); console.log('%o %o', ...objects);"
    );
    expect(Date.now() - startedAt).toBeLessThan(500);
    for (const text of texts()) {
      expect(text.length).toBeLessThanOrEqual(PREVIEW_CONSOLE_MAX_TEXT_LENGTH);
      expect(text.endsWith("…")).toBe(true);
    }
  });

  it("入れ子の値も各文字を1回だけ数え、1行の上限より手前で後続を省略しない", () => {
    const { run, texts } = runBridge();
    run(`
      console.log({ a: { b: { c: "x".repeat(330) } }, d: 1, e: 2 });
      console.log({ a: { b: { c: "x".repeat(240) } } }, { second: true });
      console.log("%o", { s: "x".repeat(340) }, "next");
    `);
    const [deep, twoArgs, withHead] = texts();
    expect(deep.endsWith("d: 1, e: 2}")).toBe(true);
    expect(twoArgs.endsWith("{second: true}")).toBe(true);
    expect(withHead.endsWith(" next")).toBe(true);
  });

  it("一部の要素の getter や Proxy が投げても、その要素だけを [unprintable] にして残りを出す", () => {
    const { run, texts } = runBridge();
    run(`
      console.log([1, 2, new Proxy({}, { ownKeys() { throw 1; } }), 4]);
      const bad = new Error("x"); Object.defineProperty(bad, "name", { get() { throw 1; } });
      console.log([1, bad, 3]);
    `);
    expect(texts()).toEqual(["[1, 2, [unprintable], 4]", "[1, [unprintable], 3]"]);
  });

  it("getter は呼ばずに (...) と表示する（副作用・再帰を起こさない）", () => {
    const { run, texts } = runBridge();
    run(`
      let calls = 0;
      const o = { get total() { calls++; console.log(this); return 1; }, n: 1 };
      console.log(o, o);
      console.log("calls", calls);
    `);
    expect(texts()).toEqual(["{total: (...), n: 1} {total: (...), n: 1}", "calls 0"]);
  });

  it("巨大な文字列を含む値も文字列ごと複製せず短時間で返す", () => {
    const { run, texts } = runBridge();
    run('var s = "y".repeat(5e7);');
    const startedAt = Date.now();
    run("console.log([s, s]); console.log([[[s]]]); console.log('%s!', s);");
    expect(Date.now() - startedAt).toBeLessThan(500);
    for (const text of texts()) {
      expect(text.length).toBeLessThanOrEqual(PREVIEW_CONSOLE_MAX_TEXT_LENGTH);
    }
  });

  it("forEach を上書きして例外を握りつぶす Map / Set でも上限で打ち切る", () => {
    const { run, texts } = runBridge();
    run(`
      class M extends Map {
        forEach(cb) { for (const [k, v] of this) { try { cb(v, k, this); } catch {} } }
      }
      var m = new M(); for (let i = 0; i < 1e6; i++) m.set(i, i);
    `);
    const startedAt = Date.now();
    run("console.log(m);");
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(texts()[0]).toMatch(/^Map\(1000000\) \{0 => 0, /);
  });

  it("元の console が多数の引数で失敗しても、受講生のコードを止めない", () => {
    const { run, original, texts } = runBridge();
    original.log.mockImplementation(() => {
      throw new RangeError("Maximum call stack size exceeded");
    });
    expect(() => run("console.log(1, 2); console.log('next');")).not.toThrow();
    expect(texts()).toEqual(["1 2", "next"]);
  });

  it("引数が1つだけなら書式指定子を置き換えない（DevTools と同じ）", () => {
    const { run, texts, listeners } = runBridge();
    run('console.log("進捗 100%% 完了 %s")');
    listeners.error({ message: "Uncaught Error: 100%% done" });
    expect(texts()).toEqual(["進捗 100%% 完了 %s", "Uncaught Error: 100%% done"]);
  });

  it("%d に Symbol や null プロトタイプのオブジェクトを渡しても受講生の console.log を止めない", () => {
    const { run, texts, original } = runBridge();
    expect(() =>
      run(`
        console.log("%d", Symbol("x"));
        console.log("%f", Object.create(null));
        console.log("%s", { toString() { throw new Error("boom"); } });
        console.log("続き");
      `)
    ).not.toThrow();
    expect(texts()).toEqual(["NaN", "NaN", "{toString: ƒ toString()}", "続き"]);
    expect(original.log).toHaveBeenCalledTimes(4);
  });

  it("%s / %d / %i / %f / %o / %c / %% を DevTools と同じように置き換える", () => {
    const { run, texts } = runBridge();
    run(`
      console.log("合計: %d 件", 5);
      console.log("%s さん %i 歳 %f", "山田", "20.9", "1.5");
      console.log("%c赤%c と %o", "color:red", "", { a: 1 });
      console.log("100%% 完了", "extra");
      console.log("%d と %d", 1);
    `);
    expect(texts()).toEqual([
      "合計: 5 件",
      "山田 さん 20 歳 1.5",
      "赤 と {a: 1}",
      "100% 完了 extra",
      "1 と %d",
    ]);
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

describe("buildPreviewConsoleBridgeScript", () => {
  it("差し込むスクリプトは途中で閉じタグを含まない", () => {
    expect(buildPreviewConsoleBridgeScript().match(/<\/script/gi)).toHaveLength(1);
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
