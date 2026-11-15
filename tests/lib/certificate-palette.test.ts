import { describe, expect, it } from "vitest";
import {
  buildCertificateThemeColors,
  CERTIFICATE_MIN_CONTRAST,
  CERTIFICATE_PALETTES,
  contrastRatio,
  getCertificatePalette,
  resolveCertificateStyles,
} from "@/app/lib/certificate-palette";
import { normalizeThemeColor } from "@/app/lib/theme-color";

describe("getCertificatePalette", () => {
  it("同じテーマは常に同じパレット", () => {
    expect(getCertificatePalette(7)).toBe(getCertificatePalette(7));
  });

  it("theme_id 1 は従来のインディゴ（0番目）", () => {
    expect(getCertificatePalette(1)).toBe(CERTIFICATE_PALETTES[0]);
  });

  it("連続した id は別のパレットになり、一巡すると戻る", () => {
    const count = CERTIFICATE_PALETTES.length;
    expect(getCertificatePalette(1)).not.toBe(getCertificatePalette(2));
    expect(getCertificatePalette(1)).toBe(getCertificatePalette(1 + count));
  });

  it("0・負数・小数でも範囲内のパレットを返す", () => {
    for (const id of [0, -1, -7, 2.5]) {
      expect(CERTIFICATE_PALETTES).toContain(getCertificatePalette(id));
    }
  });

  it("パレットの色クラスは重複しない", () => {
    const sheets = CERTIFICATE_PALETTES.map((p) => p.sheet);
    expect(new Set(sheets).size).toBe(sheets.length);
  });
});

// Thumbnail colors of the current themes plus extremes (pale, near-black, pure yellow, gray).
const SAMPLE_COLORS = [
  "#769ED4",
  "#6FA6E4",
  "#FACA7A",
  "#8979E9",
  "#5764B5",
  "#F1A570",
  "#F07679",
  "#92ECF3",
  "#2F96D7",
  "#0A3E2A",
  "#D8F8A2",
  "#FFFF00",
  "#00FF00",
  "#FFFFFF",
  "#000000",
  "#808080",
];

const lightnessOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

describe("buildCertificateThemeColors", () => {
  it.each(SAMPLE_COLORS)(
    "%s: 文字と外枠はシートの濃い側の地色に対して基準のコントラストを満たす",
    (hex) => {
      const colors = buildCertificateThemeColors(hex);
      expect(colors).not.toBeNull();
      if (!colors) return;
      expect(contrastRatio(colors.heading, colors.sheetTo)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.heading
      );
      expect(contrastRatio(colors.subtitle, colors.sheetTo)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.subtitle
      );
      expect(contrastRatio(colors.outerBorder, colors.sheetTo)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.outerBorder
      );
    }
  );

  it("元の色の明るさに関係なく、シートは淡く、見出しは濃くなる", () => {
    for (const hex of ["#D8F8A2", "#0A3E2A"]) {
      const colors = buildCertificateThemeColors(hex);
      expect(lightnessOf(colors?.sheetTo ?? "#000000")).toBeGreaterThan(0.9);
      expect(lightnessOf(colors?.heading ?? "#FFFFFF")).toBeLessThan(0.2);
    }
  });

  it("彩度は上限で抑える（原色でもシートがどぎつくならない）", () => {
    const colors = buildCertificateThemeColors("#FF0000");
    // hsl(0, 85%, 92%) = #FCD9D9; full saturation would give #FFD6D6
    expect(colors?.sheetTo).toBe("#FCD9D9");
  });

  it("大文字・小文字・前後の空白は同じ結果になる", () => {
    expect(buildCertificateThemeColors(" #3b77d8 ")).toEqual(
      buildCertificateThemeColors("#3B77D8")
    );
  });

  it.each([null, "", "#12345", "3B77D8", "#GGGGGG", "red"])("形式外（%s）は null", (value) => {
    expect(buildCertificateThemeColors(value)).toBeNull();
  });
});

describe("resolveCertificateStyles", () => {
  it("テーマカラーがあれば、その色のインライン style で描く（クラスは使わない）", () => {
    const styles = resolveCertificateStyles(1, "#3B77D8");
    const colors = buildCertificateThemeColors("#3B77D8");
    expect(styles.sheet.className).toBe("");
    expect(styles.sheet.style?.backgroundImage).toContain(colors?.sheetTo);
    expect(styles.outerBorder.style?.borderColor).toBe(colors?.outerBorder);
    expect(styles.heading.style?.color).toBe(colors?.heading);
    expect(styles.subtitle.style?.color).toBe(colors?.subtitle);
  });

  it.each([null, "", "#12345"])(
    "テーマカラーが無い・形式外（%s）なら、theme_id のパレットに戻る",
    (themeColor) => {
      const styles = resolveCertificateStyles(3, themeColor);
      const palette = getCertificatePalette(3);
      expect(styles.sheet.className).toBe(`bg-gradient-to-br ${palette.sheet}`);
      expect(styles.sheet.style).toBeUndefined();
      expect(styles.outerBorder.className).toBe(palette.outerBorder);
      expect(styles.innerBorder.className).toBe(palette.innerBorder);
      expect(styles.subtitle.className).toBe(palette.subtitle);
      expect(styles.heading.className).toBe(palette.heading);
    }
  );
});

describe("normalizeThemeColor", () => {
  it("大文字にそろえ、空白を除く。形式外と空は null", () => {
    expect(normalizeThemeColor(" #abcdef ")).toBe("#ABCDEF");
    expect(normalizeThemeColor("")).toBeNull();
    expect(normalizeThemeColor(undefined)).toBeNull();
    expect(normalizeThemeColor("#abc")).toBeNull();
  });
});
