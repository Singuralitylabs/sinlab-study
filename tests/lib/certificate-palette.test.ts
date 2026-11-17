import { describe, expect, it } from "vitest";
import {
  buildCertificateThemeColors,
  CERTIFICATE_FALLBACK_COLORS,
  CERTIFICATE_MIN_CONTRAST,
  contrastRatio,
  getCertificateFallbackColor,
  resolveCertificateColors,
} from "@/app/lib/certificate-palette";
import { normalizeThemeColor } from "@/app/lib/theme-color";

describe("getCertificateFallbackColor", () => {
  it("同じテーマは常に同じ色", () => {
    expect(getCertificateFallbackColor(7)).toBe(getCertificateFallbackColor(7));
  });

  it("theme_id 1 は従来のインディゴ（0番目）", () => {
    expect(getCertificateFallbackColor(1)).toBe(CERTIFICATE_FALLBACK_COLORS[0]);
  });

  it("連続した id は別の色になり、一巡すると戻る", () => {
    const count = CERTIFICATE_FALLBACK_COLORS.length;
    expect(getCertificateFallbackColor(1)).not.toBe(getCertificateFallbackColor(2));
    expect(getCertificateFallbackColor(1)).toBe(getCertificateFallbackColor(1 + count));
  });

  it("0・負数・小数でも範囲内の色を返す", () => {
    for (const id of [0, -1, -7, 2.5]) {
      expect(CERTIFICATE_FALLBACK_COLORS).toContain(getCertificateFallbackColor(id));
    }
  });

  it("色は重複せず、すべて #RRGGBB", () => {
    expect(new Set(CERTIFICATE_FALLBACK_COLORS).size).toBe(CERTIFICATE_FALLBACK_COLORS.length);
    for (const hex of CERTIFICATE_FALLBACK_COLORS) {
      expect(normalizeThemeColor(hex)).toBe(hex);
    }
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
    "%s: 文字と外枠は紙の濃い側の地色に対して基準のコントラストを満たす",
    (hex) => {
      const colors = buildCertificateThemeColors(hex);
      expect(colors).not.toBeNull();
      if (!colors) return;
      expect(contrastRatio(colors.heading, colors.paper)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.heading
      );
      expect(contrastRatio(colors.accent, colors.paper)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.accent
      );
      expect(contrastRatio(colors.frame, colors.paper)).toBeGreaterThanOrEqual(
        CERTIFICATE_MIN_CONTRAST.frame
      );
    }
  );

  it("元の色の明るさに関係なく、紙は淡く、見出しは濃くなる", () => {
    for (const hex of ["#D8F8A2", "#0A3E2A"]) {
      const colors = buildCertificateThemeColors(hex);
      expect(lightnessOf(colors?.paper ?? "#000000")).toBeGreaterThan(0.95);
      expect(lightnessOf(colors?.heading ?? "#FFFFFF")).toBeLessThan(0.2);
    }
  });

  it("彩度は上限で抑える（原色でも紙がどぎつくならない）", () => {
    const colors = buildCertificateThemeColors("#FF0000");
    // hsl(0, 85%, 82%) = #F8AAAA; full saturation would give #FFA3A3
    expect(colors?.pattern).toBe("#F8AAAA");
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

describe("resolveCertificateColors", () => {
  it("テーマカラーがあれば、その色から作る", () => {
    expect(resolveCertificateColors(1, "#3B77D8")).toEqual(buildCertificateThemeColors("#3B77D8"));
  });

  it.each([null, "", "#12345"])(
    "テーマカラーが無い・形式外（%s）なら、theme_id の色から作る",
    (themeColor) => {
      expect(resolveCertificateColors(3, themeColor)).toEqual(
        buildCertificateThemeColors(getCertificateFallbackColor(3))
      );
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
