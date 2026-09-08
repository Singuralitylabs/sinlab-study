import { describe, expect, it } from "vitest";
import { parseSlideObjectKey, toSlideObjectKey } from "@/app/lib/slide-object-key";

describe("toSlideObjectKey", () => {
  it("オブジェクトキーはそのまま返す", () => {
    expect(toSlideObjectKey("gas/slide-01.pdf")).toBe("gas/slide-01.pdf");
    expect(toSlideObjectKey("gas-advanced/slide-100.pdf")).toBe("gas-advanced/slide-100.pdf");
  });

  it("旧形式のタイムスタンプ付きキー（バケット直下）もそのまま返す", () => {
    expect(toSlideObjectKey("1700000000000_intro.pdf")).toBe("1700000000000_intro.pdf");
  });

  it.each([
    ["シード由来の相対パス", "/storage/v1/object/public/slides/gas/slide-01.pdf"],
    [
      "管理画面由来の完全URL",
      "https://project.supabase.co/storage/v1/object/public/slides/gas/slide-01.pdf",
    ],
    ["http の完全URL", "http://localhost:54321/storage/v1/object/public/slides/gas/slide-01.pdf"],
    ["前後の空白付き", "  /storage/v1/object/public/slides/gas/slide-01.pdf  "],
  ])("旧形式の公開URL（%s）はキーへ正規化する", (_label, value) => {
    expect(toSlideObjectKey(value)).toBe("gas/slide-01.pdf");
  });

  it.each([
    ["空文字", ""],
    ["空白のみ", "   "],
    ["null", null],
    ["undefined", undefined],
    ["外部URL", "https://example.com/slides/gas/slide-01.pdf"],
    ["他バケットの公開URL", "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png"],
    ["スラッシュ始まり", "/gas/slide-01.pdf"],
    ["接頭辞だけで空のキー", "/storage/v1/object/public/slides/"],
    ["親ディレクトリ参照", "gas/../secret/slide-01.pdf"],
    ["空セグメント", "gas//slide-01.pdf"],
    ["スキーム付き", "data:application/pdf;base64,AAAA"],
  ])("キーとして解釈できない値（%s）は null を返す", (_label, value) => {
    expect(toSlideObjectKey(value)).toBeNull();
  });
});

describe("parseSlideObjectKey", () => {
  it("命名規約に沿ったキーからコーススラッグとスライド番号を取り出す", () => {
    expect(parseSlideObjectKey("gas-advanced/slide-03.pdf")).toEqual({
      folder: "gas-advanced",
      slideNumber: 3,
    });
    expect(parseSlideObjectKey("gas/slide-100.pdf")).toEqual({ folder: "gas", slideNumber: 100 });
  });

  it("旧形式の公開URLも正規化してから解釈する", () => {
    expect(
      parseSlideObjectKey(
        "https://project.supabase.co/storage/v1/object/public/slides/gas-advanced/slide-03.pdf"
      )
    ).toEqual({ folder: "gas-advanced", slideNumber: 3 });
  });

  it.each([
    ["タイムスタンプ形式", "1700000000000_intro.pdf"],
    ["大文字を含むスラッグ", "GAS/slide-01.pdf"],
    ["番号無し", "gas/slide.pdf"],
    ["桁あふれ", "gas/slide-99999999999999999999.pdf"],
    ["null", null],
  ])("規約に沿わないキー（%s）は null を返す", (_label, value) => {
    expect(parseSlideObjectKey(value)).toBeNull();
  });
});
