import { describe, expect, it } from "vitest";
import {
  acceptPythonWorkerMessage,
  appendPythonOutput,
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
