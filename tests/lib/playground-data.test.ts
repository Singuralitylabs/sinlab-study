import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { checkJson, checkYaml, lineColumnAt } from "@/app/lib/playground-data";

describe("checkJson", () => {
  it("正しい JSON は整えて返し、全体の形を説明する", () => {
    const result = checkJson('{"name":"シンラビ","skills":["HTML"]}');
    expect(result).toEqual({
      ok: true,
      pretty: '{\n  "name": "シンラビ",\n  "skills": [\n    "HTML"\n  ]\n}',
      summary: "オブジェクト（キー 2 個）",
    });
    expect(checkJson("[1, 2, 3]")).toMatchObject({ ok: true, summary: "配列（要素 3 個）" });
  });

  it("誤りは行と列を付けて返す", () => {
    const result = checkJson('{\n  "a": 1,\n  "b" 2\n}');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ line: 3 });
    expect(checkJson("   ")).toMatchObject({ ok: false, message: "中身が空です" });
  });

  it("位置だけのエラーからも行と列を求める", () => {
    expect(lineColumnAt("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});

describe("checkYaml", () => {
  it("正しい YAML は JSON にして返す", () => {
    expect(checkYaml(yaml, "name: シンラビ\nskills:\n  - HTML\n")).toEqual({
      ok: true,
      pretty: '{\n  "name": "シンラビ",\n  "skills": [\n    "HTML"\n  ]\n}',
      summary: "オブジェクト（キー 2 個）",
    });
  });

  it("誤りは 1 から数えた行と列で返す", () => {
    expect(checkYaml(yaml, "a: 1\n  b: 2\n")).toMatchObject({
      ok: false,
      message: "bad indentation of a mapping entry",
      line: 2,
      column: 4,
    });
  });

  it("JavaScript の型のタグは受け付けない", () => {
    expect(checkYaml(yaml, 'x: !!js/function "function () {}"').ok).toBe(false);
  });
});
