import { normalizeThemeColor } from "@/app/lib/theme-color";

// Seeds for themes without a theme color, run through the same derivation as a theme color. Index 0
// (theme_id 1) is the original indigo. Append only: inserting or removing shifts every theme that
// has already cycled, including issued certificates.
export const CERTIFICATE_FALLBACK_COLORS: readonly string[] = [
  "#6366F1",
  "#10B981",
  "#F43F5E",
  "#0EA5E9",
  "#F59E0B",
  "#8B5CF6",
  "#14B8A6",
  "#F97316",
  "#D946EF",
  "#06B6D4",
  "#84CC16",
  "#64748B",
];

/**
 * Stable per theme and needs no setup when a theme is added: ids cycle through the seeds.
 * Keyed on theme_id, not the printed theme_name, so renaming a theme never recolors a certificate.
 */
export function getCertificateFallbackColor(themeId: number): string {
  const count = CERTIFICATE_FALLBACK_COLORS.length;
  // ids start at 1 (SERIAL), so subtract 1 to keep the first theme on the original color.
  const index = (((Math.trunc(themeId) - 1) % count) + count) % count;
  return CERTIFICATE_FALLBACK_COLORS[index];
}

/** Colors derived from a theme color (`#RRGGBB`), applied as inline styles. */
export interface CertificateThemeColors {
  /** Tint at the edge of the paper (the center stays white). */
  paper: string;
  /** Hairlines of the background pattern. */
  pattern: string;
  /** Thick outer frame and the seal's center. */
  frame: string;
  /** English subtitle, theme name and the lighter ribbon tail. */
  accent: string;
  /** 「修了証」 heading. */
  heading: string;
}

// Thumbnail backgrounds range from pale (#D8F8A2) to near-black (#0A3E2A), so only hue and
// saturation come from the theme color; lightness is fixed per role. Otherwise a pale color gives
// unreadable frames and text, and a dark one gives a dark sheet that prints badly.
const PAPER_LIGHTNESS = 0.97;
const PATTERN_LIGHTNESS = 0.82;
const FRAME_LIGHTNESS = 0.25;
const ACCENT_LIGHTNESS = 0.4;
const HEADING_LIGHTNESS = 0.15;
// Caps loud thumbnail colors so the certificate stays calm next to the gold.
const MAX_SATURATION = 0.85;

// WCAG contrast against the darkest point of the paper. Yellow and lime hues are much lighter than
// blue at the same HSL lightness, so fixed lightness alone fails these; the color is darkened until
// it passes.
export const CERTIFICATE_MIN_CONTRAST = {
  heading: 7,
  accent: 4.5,
  frame: 3,
} as const;

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`;
}

function rgbToHueSaturation([r, g, b]: Rgb): { h: number; s: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two `#RRGGBB` colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Certificate colors from a theme color, or null when the value is not `#RRGGBB` (the caller then
 * falls back to the theme_id seed).
 */
export function buildCertificateThemeColors(
  themeColor: string | null
): CertificateThemeColors | null {
  const normalized = normalizeThemeColor(themeColor);
  return normalized === null ? null : deriveCertificateColors(normalized);
}

function deriveCertificateColors(hex: string): CertificateThemeColors {
  const { h, s: rawS } = rgbToHueSaturation(hexToRgb(hex));
  const s = Math.min(rawS, MAX_SATURATION);
  const at = (l: number) => rgbToHex(hslToRgb(h, s, l));
  const paper = at(PAPER_LIGHTNESS);
  const darkEnough = (start: number, minContrast: number) => {
    for (let l = start; l > 0; l -= 0.01) {
      const color = at(l);
      if (contrastRatio(color, paper) >= minContrast) return color;
    }
    return at(0);
  };

  return {
    paper,
    pattern: at(PATTERN_LIGHTNESS),
    frame: darkEnough(FRAME_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.frame),
    accent: darkEnough(ACCENT_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.accent),
    heading: darkEnough(HEADING_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.heading),
  };
}

/**
 * The theme color wins when set and valid; otherwise the theme_id seed, so themes without a color
 * (and a theme the learner can no longer read) still get a stable color of their own.
 */
export function resolveCertificateColors(
  themeId: number,
  themeColor: string | null
): CertificateThemeColors {
  return deriveCertificateColors(
    normalizeThemeColor(themeColor) ?? getCertificateFallbackColor(themeId)
  );
}
