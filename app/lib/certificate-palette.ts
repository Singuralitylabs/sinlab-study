import type { CSSProperties } from "react";
import { normalizeThemeColor } from "@/app/lib/theme-color";

export interface CertificatePalette {
  sheet: string;
  outerBorder: string;
  innerBorder: string;
  subtitle: string;
  heading: string;
}

// Full class strings, not built from parts: Tailwind only emits classes it can see literally.
// Index 0 is the original indigo design (theme_id 1).
export const CERTIFICATE_PALETTES: readonly CertificatePalette[] = [
  {
    sheet: "from-white via-indigo-50 to-emerald-50",
    outerBorder: "border-indigo-900",
    innerBorder: "border-indigo-400",
    subtitle: "text-indigo-700",
    heading: "text-indigo-950",
  },
  {
    sheet: "from-white via-emerald-50 to-sky-50",
    outerBorder: "border-emerald-900",
    innerBorder: "border-emerald-400",
    subtitle: "text-emerald-700",
    heading: "text-emerald-950",
  },
  {
    sheet: "from-white via-rose-50 to-amber-50",
    outerBorder: "border-rose-900",
    innerBorder: "border-rose-400",
    subtitle: "text-rose-700",
    heading: "text-rose-950",
  },
  {
    sheet: "from-white via-sky-50 to-indigo-50",
    outerBorder: "border-sky-900",
    innerBorder: "border-sky-400",
    subtitle: "text-sky-700",
    heading: "text-sky-950",
  },
  {
    sheet: "from-white via-amber-50 to-rose-50",
    outerBorder: "border-amber-900",
    innerBorder: "border-amber-400",
    subtitle: "text-amber-700",
    heading: "text-amber-950",
  },
  {
    sheet: "from-white via-violet-50 to-pink-50",
    outerBorder: "border-violet-900",
    innerBorder: "border-violet-400",
    subtitle: "text-violet-700",
    heading: "text-violet-950",
  },
  {
    sheet: "from-white via-teal-50 to-sky-50",
    outerBorder: "border-teal-900",
    innerBorder: "border-teal-400",
    subtitle: "text-teal-700",
    heading: "text-teal-950",
  },
  {
    sheet: "from-white via-orange-50 to-rose-50",
    outerBorder: "border-orange-900",
    innerBorder: "border-orange-400",
    subtitle: "text-orange-700",
    heading: "text-orange-950",
  },
  {
    sheet: "from-white via-fuchsia-50 to-indigo-50",
    outerBorder: "border-fuchsia-900",
    innerBorder: "border-fuchsia-400",
    subtitle: "text-fuchsia-700",
    heading: "text-fuchsia-950",
  },
  {
    sheet: "from-white via-cyan-50 to-emerald-50",
    outerBorder: "border-cyan-900",
    innerBorder: "border-cyan-400",
    subtitle: "text-cyan-700",
    heading: "text-cyan-950",
  },
  {
    sheet: "from-white via-lime-50 to-amber-50",
    outerBorder: "border-lime-900",
    innerBorder: "border-lime-400",
    subtitle: "text-lime-700",
    heading: "text-lime-950",
  },
  {
    sheet: "from-white via-slate-50 to-sky-50",
    outerBorder: "border-slate-900",
    innerBorder: "border-slate-400",
    subtitle: "text-slate-700",
    heading: "text-slate-950",
  },
];

/**
 * Stable per theme and needs no setup when a theme is added: ids cycle through the palettes.
 * Keyed on theme_id, not the printed theme_name, so renaming a theme never recolors a certificate.
 */
export function getCertificatePalette(themeId: number): CertificatePalette {
  const count = CERTIFICATE_PALETTES.length;
  // ids start at 1 (SERIAL), so subtract 1 to keep the first theme on the original design.
  const index = (((Math.trunc(themeId) - 1) % count) + count) % count;
  return CERTIFICATE_PALETTES[index];
}

/** Colors derived from a theme color (`#RRGGBB`), applied as inline styles. */
export interface CertificateThemeColors {
  sheetVia: string;
  sheetTo: string;
  outerBorder: string;
  innerBorder: string;
  subtitle: string;
  heading: string;
}

// Thumbnail backgrounds range from pale (#D8F8A2) to near-black (#0A3E2A), so only hue and
// saturation come from the theme color; lightness is fixed per role. Otherwise a pale color gives
// unreadable borders and text, and a dark one gives a dark sheet that prints badly.
const SHEET_VIA_LIGHTNESS = 0.96;
const SHEET_TO_LIGHTNESS = 0.92;
const INNER_BORDER_LIGHTNESS = 0.62;
const OUTER_BORDER_LIGHTNESS = 0.25;
const SUBTITLE_LIGHTNESS = 0.35;
const HEADING_LIGHTNESS = 0.15;
// Caps loud thumbnail colors so the certificate stays calm.
const MAX_SATURATION = 0.85;

// WCAG contrast against the darkest point of the sheet (sheetTo). Yellow and lime hues are much
// lighter than blue at the same HSL lightness, so fixed lightness alone fails these; the color is
// darkened until it passes.
export const CERTIFICATE_MIN_CONTRAST = {
  heading: 7,
  subtitle: 4.5,
  outerBorder: 3,
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
 * falls back to the theme_id palette).
 */
export function buildCertificateThemeColors(
  themeColor: string | null
): CertificateThemeColors | null {
  const normalized = normalizeThemeColor(themeColor);
  if (normalized === null) return null;

  const { h, s: rawS } = rgbToHueSaturation(hexToRgb(normalized));
  const s = Math.min(rawS, MAX_SATURATION);
  const at = (l: number) => rgbToHex(hslToRgb(h, s, l));
  const sheetTo = at(SHEET_TO_LIGHTNESS);
  const darkEnough = (start: number, minContrast: number) => {
    for (let l = start; l > 0; l -= 0.01) {
      const color = at(l);
      if (contrastRatio(color, sheetTo) >= minContrast) return color;
    }
    return at(0);
  };

  return {
    sheetVia: at(SHEET_VIA_LIGHTNESS),
    sheetTo,
    outerBorder: darkEnough(OUTER_BORDER_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.outerBorder),
    innerBorder: at(INNER_BORDER_LIGHTNESS),
    subtitle: darkEnough(SUBTITLE_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.subtitle),
    heading: darkEnough(HEADING_LIGHTNESS, CERTIFICATE_MIN_CONTRAST.heading),
  };
}

export interface CertificateElementStyle {
  className: string;
  style?: CSSProperties;
}

export interface CertificateSheetStyles {
  sheet: CertificateElementStyle;
  outerBorder: CertificateElementStyle;
  innerBorder: CertificateElementStyle;
  subtitle: CertificateElementStyle;
  heading: CertificateElementStyle;
}

/**
 * The theme color wins when set and valid; otherwise the theme_id palette, so themes without a
 * color (and a theme the learner can no longer read) look exactly as before.
 */
export function resolveCertificateStyles(
  themeId: number,
  themeColor: string | null
): CertificateSheetStyles {
  const colors = buildCertificateThemeColors(themeColor);
  if (colors === null) {
    const palette = getCertificatePalette(themeId);
    return {
      sheet: { className: `bg-gradient-to-br ${palette.sheet}` },
      outerBorder: { className: palette.outerBorder },
      innerBorder: { className: palette.innerBorder },
      subtitle: { className: palette.subtitle },
      heading: { className: palette.heading },
    };
  }
  return {
    sheet: {
      className: "",
      style: {
        backgroundImage: `linear-gradient(to bottom right, #FFFFFF, ${colors.sheetVia}, ${colors.sheetTo})`,
      },
    },
    outerBorder: { className: "", style: { borderColor: colors.outerBorder } },
    innerBorder: { className: "", style: { borderColor: colors.innerBorder } },
    subtitle: { className: "", style: { color: colors.subtitle } },
    heading: { className: "", style: { color: colors.heading } },
  };
}
