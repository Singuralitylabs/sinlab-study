import { describe, expect, it } from "vitest";
import { normalize, pragmas } from "../../scripts/check-comment-only-diff";

const same = (a: string, b: string) => expect(normalize(a)).toBe(normalize(b));
const differ = (a: string, b: string) => expect(normalize(a)).not.toBe(normalize(b));

describe("check-comment-only-diff normalize", () => {
  it("ignores added and removed comments", () => {
    same("const a = 1;", "// why\nconst a = 1; /* tail */");
  });

  it("detects logic and literal changes", () => {
    differ("const a = 1;", "const a = 2;");
    differ("const a = 'x';", "const a = 'y';");
    differ("const a: number = 1;", "const a: string = '1';");
  });

  it("ignores a JSX comment removed between elements", () => {
    same(
      "const v = <div>\n  <b />\n  {/* c */}\n  <i />\n</div>;",
      "const v = <div>\n  <b />\n  <i />\n</div>;"
    );
  });

  it("detects a JSX comment removed between two text lines (foobar vs foo bar)", () => {
    differ("const v = <p>\n  foo\n  {/* c */}\n  bar\n</p>;", "const v = <p>\n  foo\n  bar\n</p>;");
  });

  it("detects real JSX text changes", () => {
    differ("const v = <p>foo bar</p>;", "const v = <p>foo  bar</p>;");
  });
});

describe("check-comment-only-diff pragmas", () => {
  it("detects added or removed tool pragmas", () => {
    expect(pragmas("// @ts-ignore\nconst a = 1;")).not.toBe(pragmas("const a = 1;"));
    expect(pragmas("// biome-ignore lint/a/b: r\nconst a = 1;")).not.toBe(pragmas("const a = 1;"));
  });

  it("allows rewording the reason and ignores plain comments", () => {
    expect(pragmas("// biome-ignore lint/a/b: 理由\nconst a = 1;")).toBe(
      pragmas("// biome-ignore lint/a/b: reason\nconst a = 1;")
    );
    expect(pragmas("// hello\nconst a = 1;")).toBe(pragmas("const a = 1;"));
  });

  it("treats a different biome rule as a change", () => {
    expect(pragmas("// biome-ignore lint/a/b: r\nx;")).not.toBe(
      pragmas("// biome-ignore lint/a/c: r\nx;")
    );
  });
});
