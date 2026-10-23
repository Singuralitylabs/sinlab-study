import { describe, expect, it } from "vitest";
import {
  MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
  MARKDOWN_IMAGE_MAX_WIDTH_PX,
  MARKDOWN_IMAGE_MIN_WIDTH_PX,
} from "@/app/constants/markdown";
import { resolveMarkdownImageWidth } from "@/app/lib/markdown-image-width";

describe("resolveMarkdownImageWidth", () => {
  it("title が無いときは既定の最大幅で、表示用 title も無い", () => {
    expect(resolveMarkdownImageWidth(undefined)).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    });
    expect(resolveMarkdownImageWidth(null)).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    });
    expect(resolveMarkdownImageWidth("")).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    });
  });

  it("通常の title はツールチップ用に残し、幅は既定の最大幅", () => {
    expect(resolveMarkdownImageWidth("図1の説明")).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: "図1の説明",
    });
  });

  it("文中に w= があっても title 全体が指令でなければ残す", () => {
    expect(resolveMarkdownImageWidth("caption w=400")).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: "caption w=400",
    });
  });

  it("w=数値 の有効値はその幅になり、title は残さない", () => {
    expect(resolveMarkdownImageWidth("w=400")).toEqual({
      widthPx: 400,
      hasExplicitWidth: true,
      displayTitle: undefined,
    });
    expect(resolveMarkdownImageWidth("  w=320  ")).toEqual({
      widthPx: 320,
      hasExplicitWidth: true,
      displayTitle: undefined,
    });
    expect(resolveMarkdownImageWidth("W=200")).toEqual({
      widthPx: 200,
      hasExplicitWidth: true,
      displayTitle: undefined,
    });
  });

  it("下限・上限ちょうどの値は有効", () => {
    expect(resolveMarkdownImageWidth(`w=${MARKDOWN_IMAGE_MIN_WIDTH_PX}`)).toEqual({
      widthPx: MARKDOWN_IMAGE_MIN_WIDTH_PX,
      hasExplicitWidth: true,
      displayTitle: undefined,
    });
    expect(resolveMarkdownImageWidth(`w=${MARKDOWN_IMAGE_MAX_WIDTH_PX}`)).toEqual({
      widthPx: MARKDOWN_IMAGE_MAX_WIDTH_PX,
      hasExplicitWidth: true,
      displayTitle: undefined,
    });
  });

  it.each([
    "w=abc",
    "w=-10",
    "w=0",
    `w=${MARKDOWN_IMAGE_MIN_WIDTH_PX - 1}`,
    `w=${MARKDOWN_IMAGE_MAX_WIDTH_PX + 1}`,
    "w=1.5",
    "w=400px",
    "w=",
    "w=  ",
  ])("%s は無視して既定幅にし、指令の title は残さない", (title) => {
    expect(resolveMarkdownImageWidth(title)).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    });
  });

  it("width=400 のように別名は指令ではない", () => {
    expect(resolveMarkdownImageWidth("width=400")).toEqual({
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: "width=400",
    });
  });
});
