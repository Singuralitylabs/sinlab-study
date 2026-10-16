import { describe, expect, it } from "vitest";
import {
  buildContentImageMarkdownRef,
  buildContentImageObjectKey,
  insertMarkdownAtSelection,
} from "@/app/lib/content-image-key";

describe("buildContentImageObjectKey", () => {
  it("contentId とランダムIDと拡張子からキーを組む", () => {
    expect(
      buildContentImageObjectKey({
        contentId: 42,
        extension: "png",
        randomId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      })
    ).toBe("content-42/a1b2c3d4-e5f6-7890-abcd-ef1234567890.png");
  });
});

describe("buildContentImageMarkdownRef", () => {
  it("プレースホルダ付きの参照を返し完全な URL は含まない", () => {
    const ref = buildContentImageMarkdownRef("content-1/uuid.webp");
    expect(ref).toBe("{{SUPABASE_STORAGE_URL}}/content-images/content-1/uuid.webp");
    expect(ref).not.toMatch(/^https?:/);
  });
});

describe("insertMarkdownAtSelection", () => {
  it("カーソル位置に挿入しキャレットを末尾へ進める", () => {
    expect(insertMarkdownAtSelection("ab", 1, 1, "X")).toEqual({ next: "aXb", caret: 2 });
  });

  it("選択範囲を置換する", () => {
    expect(insertMarkdownAtSelection("hello", 1, 4, "i")).toEqual({ next: "hio", caret: 2 });
  });
});
