import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DemoSubmissionForm（/demo）", () => {
  it("ライブプレビュー部品を読み込まない（#475）", () => {
    const source = readFileSync("app/demo/components/DemoSubmissionForm.tsx", "utf8");
    expect(source).not.toContain("HtmlPreview");
    expect(source).not.toContain("resolvePreviewDisplay");
    expect(source).not.toContain("buildPreviewDocument");
  });
});
