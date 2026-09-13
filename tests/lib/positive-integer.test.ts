import { describe, expect, it } from "vitest";
import { parsePositiveInteger } from "@/app/lib/positive-integer";

describe("parsePositiveInteger", () => {
  it.each([
    ["1", 1],
    ["01", 1],
    ["12", 12],
    ["100", 100],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("%j を %d として解釈する", (value, expected) => {
    expect(parsePositiveInteger(value)).toBe(expected);
  });

  // Number.parseInt() の部分解釈で通ってしまう値を含めて、全体一致であることを担保する
  it.each([
    ["1abc"],
    ["1.5"],
    ["0"],
    [" 1"],
    ["1 "],
    ["-1"],
    ["+1"],
    [""],
    [" "],
    ["1e2"],
    ["0x10"],
    ["１"],
    ["99999999999999999999"],
  ])("%j は解釈せず null を返す", (value) => {
    expect(parsePositiveInteger(value)).toBeNull();
  });

  it("null と File は解釈せず null を返す", () => {
    expect(parsePositiveInteger(null)).toBeNull();
    expect(parsePositiveInteger(new File(["1"], "n.txt", { type: "text/plain" }))).toBeNull();
  });
});
