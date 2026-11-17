import { StringStream } from "@codemirror/language";
import { createLowlight } from "lowlight";
import { describe, expect, it } from "vitest";
import {
  CODE_LANGUAGE_LABELS,
  CODE_LANGUAGES,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import { hcl } from "@/app/lib/hcl-stream-mode";
import highlightHcl from "@/app/lib/highlight-hcl";
import { canPreviewFiles, previewCapability } from "@/app/lib/html-preview";

function tokenize(source: string): [string, string | null][] {
  const state = hcl.startState?.(2) ?? { inBlockComment: false, heredoc: null };
  const tokens: [string, string | null][] = [];
  for (const line of source.split("\n")) {
    const stream = new StringStream(line, 2, 2);
    while (!stream.eol()) {
      const style = hcl.token(stream, state);
      const text = stream.current();
      if (text.trim()) tokens.push([text, style]);
      stream.start = stream.pos;
    }
  }
  return tokens;
}

describe("コード言語 hcl", () => {
  it("CODE_LANGUAGES に入り、既定ファイル名は main.tf", () => {
    expect(CODE_LANGUAGES).toContain("hcl");
    expect(DEFAULT_FILENAME_BY_LANGUAGE.hcl).toBe("main.tf");
    expect(CODE_LANGUAGE_LABELS.hcl).toBe("HCL（Terraform）");
  });

  it("プレビューもコンソールも出さない", () => {
    const files = [{ filename: "main.tf", language: "hcl", content: "x" }];
    expect(canPreviewFiles(files)).toBe(false);
    expect(previewCapability(files)).toEqual({
      autoPreview: false,
      autoConsole: false,
      previewAllowed: false,
      consoleAllowed: false,
    });
    expect(previewCapability([{ filename: "main.tf", language: "" }])).toMatchObject({
      previewAllowed: false,
      consoleAllowed: false,
    });
  });
});

describe("エディタの HCL トークナイザ", () => {
  it("ブロック・属性・文字列・コメント・リテラルを色分けする", () => {
    const tokens = tokenize(
      [
        "# comment",
        'resource "aws_s3_bucket" "site" {',
        `  bucket = "name-\${var.env}"`,
        "  force_destroy = true",
        "  count = 2 // two",
        "}",
      ].join("\n")
    );
    expect(tokens).toContainEqual(["# comment", "comment"]);
    expect(tokens).toContainEqual(["resource", "keyword"]);
    expect(tokens).toContainEqual(['"aws_s3_bucket"', "string"]);
    expect(tokens).toContainEqual(["bucket", "property"]);
    expect(tokens).toContainEqual([`"name-\${var.env}"`, "string"]);
    expect(tokens).toContainEqual(["true", "atom"]);
    expect(tokens).toContainEqual(["2", "number"]);
    expect(tokens).toContainEqual(["// two", "comment"]);
  });

  it("複数行のリストや引数の行頭にある参照はブロックの種類として塗らない", () => {
    const tokens = tokenize(
      [
        'resource "aws_s3_bucket_policy" "site" {',
        "  depends_on = [",
        "    aws_s3_bucket_public_access_block.site,",
        "  ]",
        "  tags = merge(",
        "    local.common_tags,",
        "  )",
        "  lifecycle {",
        "  }",
        "}",
      ].join("\n")
    );
    expect(tokens).toContainEqual(["aws_s3_bucket_public_access_block", "variable"]);
    expect(tokens).toContainEqual(["local", "variable"]);
    expect(tokens).toContainEqual(["lifecycle", "keyword"]);
  });

  it("補間の中の引用符で文字列が途中で切れない", () => {
    const tokens = tokenize(`  name = "\${lookup(var.m, "k", "d")}-x"`);
    expect(tokens).toContainEqual([`"\${lookup(var.m, "k", "d")}-x"`, "string"]);
  });

  it("ヒアドキュメントとブロックコメントは終わりの行まで続く", () => {
    const tokens = tokenize(
      ["  policy = <<-EOT", '    { "a": 1 }', "  EOT", "/* a", "b */", "x = 1"].join("\n")
    );
    expect(tokens).toContainEqual(['    { "a": 1 }', "string"]);
    expect(tokens).toContainEqual(["  EOT", "string"]);
    expect(tokens).toContainEqual(["b */", "comment"]);
    expect(tokens).toContainEqual(["x", "property"]);
  });
});

describe("記事の HCL ハイライト", () => {
  const lowlight = createLowlight({ hcl: highlightHcl });

  it("ヒアドキュメントは自分の終端でだけ閉じる", () => {
    const tree = lowlight.highlight(
      "hcl",
      ["policy = <<EOT", "OTHER", "EOT", 'name = "x"'].join("\n")
    );
    const strings = tree.children.filter(
      (node) =>
        node.type === "element" &&
        Array.isArray(node.properties.className) &&
        node.properties.className.includes("hljs-string")
    );
    expect(strings).toHaveLength(2);
  });
});
