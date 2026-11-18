import { describe, expect, it } from "vitest";
import {
  acceptPythonWorkerMessage,
  appendPythonOutput,
  PYTHON_MAX_FIGURE_BYTES,
  PYTHON_MAX_OUTPUT_LENGTH,
  preparePythonRun,
} from "@/app/lib/python-runner";

const file = (filename: string, content = "print(1)") => ({ filename, content });

describe("preparePythonRun", () => {
  it("main.py があればそれを、なければ最初のファイルを実行する", () => {
    expect(preparePythonRun([file("helper.py"), file("main.py")])).toEqual({
      ok: true,
      entry: "main.py",
      files: [file("helper.py"), file("main.py")],
    });
    expect(preparePythonRun([file("ex1.py"), file("helper.py")])).toMatchObject({
      ok: true,
      entry: "ex1.py",
    });
  });

  it("名前のない 1 ファイルの提出は main.py として実行する", () => {
    expect(preparePythonRun([file("  ")])).toEqual({
      ok: true,
      entry: "main.py",
      files: [file("main.py")],
    });
  });

  it("フォルダを含む名前・名前なし（複数ファイル）・重複・空のコードは実行しない", () => {
    for (const files of [
      [file("../main.py")],
      [file("src/main.py")],
      [file("a\\b.py")],
      [file(".."), file("main.py")],
      [file("main.py"), file("")],
      [file("main.py"), file("main.py")],
      [file("main.py", "  \n")],
      [],
    ]) {
      expect(preparePythonRun(files).ok).toBe(false);
    }
  });
});

describe("appendPythonOutput", () => {
  it("同じストリームの続きはつなげ、ストリームが変わると分ける", () => {
    let chunks = appendPythonOutput([], "stdout", "a\n").chunks;
    chunks = appendPythonOutput(chunks, "stdout", "b").chunks;
    chunks = appendPythonOutput(chunks, "stderr", "err\n").chunks;
    chunks = appendPythonOutput(chunks, "stdout", "c\n").chunks;
    expect(chunks).toEqual([
      { stream: "stdout", text: "a\nb" },
      { stream: "stderr", text: "err\n" },
      { stream: "stdout", text: "c\n" },
    ]);
  });

  it("上限を超えた分は切り捨てて truncated を返す", () => {
    const full = "x".repeat(PYTHON_MAX_OUTPUT_LENGTH - 2);
    const first = appendPythonOutput([], "stdout", full);
    expect(first.truncated).toBe(false);
    const second = appendPythonOutput(first.chunks, "stderr", "abcd");
    expect(second.truncated).toBe(true);
    expect(second.chunks[1]).toEqual({ stream: "stderr", text: "ab" });
    const third = appendPythonOutput(second.chunks, "stdout", "z");
    expect(third).toEqual({ chunks: second.chunks, truncated: true });
  });
});

describe("acceptPythonWorkerMessage", () => {
  it("既知の形だけを通す", () => {
    expect(acceptPythonWorkerMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(acceptPythonWorkerMessage({ type: "done", extra: 1 })).toEqual({ type: "done" });
    expect(acceptPythonWorkerMessage({ type: "truncated" })).toEqual({ type: "truncated" });
    expect(acceptPythonWorkerMessage({ type: "output", stream: "stderr", text: "x" })).toEqual({
      type: "output",
      stream: "stderr",
      text: "x",
    });
    expect(acceptPythonWorkerMessage({ type: "fatal", message: "m" })).toEqual({
      type: "fatal",
      message: "m",
    });
  });

  it("読み込むパッケージ名と、PNG のグラフを通す", () => {
    expect(acceptPythonWorkerMessage({ type: "packages", names: ["numpy", "pandas"] })).toEqual({
      type: "packages",
      names: ["numpy", "pandas"],
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(acceptPythonWorkerMessage({ type: "figure", png })).toEqual({ type: "figure", png });
    expect(acceptPythonWorkerMessage({ type: "figure-skipped" })).toEqual({
      type: "figure-skipped",
    });
  });

  it("PNG でないもの・大きすぎる画像は捨てる", () => {
    const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const tooLarge = new Uint8Array(PYTHON_MAX_FIGURE_BYTES + 1);
    tooLarge.set(header);
    for (const png of [
      new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0, 0, 0, 0]),
      new Uint8Array(header),
      tooLarge,
      Array.from(header),
      "data:image/png;base64,AAAA",
    ]) {
      expect(acceptPythonWorkerMessage({ type: "figure", png })).toBeNull();
    }
    expect(acceptPythonWorkerMessage({ type: "packages", names: [1] })).toBeNull();
  });

  it("形の違うメッセージは捨てる", () => {
    for (const raw of [
      null,
      "ready",
      { type: "output", stream: "html", text: "x" },
      { type: "output", stream: "stdout", text: 1 },
      { type: "fatal" },
      { type: "image", data: "x" },
    ]) {
      expect(acceptPythonWorkerMessage(raw)).toBeNull();
    }
  });
});
