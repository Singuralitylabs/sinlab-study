export interface CertificatePalette {
  sheet: string;
  outerBorder: string;
  innerBorder: string;
  subtitle: string;
  heading: string;
}

// Full class strings, not built from parts: Tailwind only emits classes it can see literally.
// Index 0 is the original indigo design.
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
];

/**
 * Stable per theme and needs no setup when a theme is added: ids cycle through the palettes.
 * Keyed on theme_id, not the printed theme_name, so renaming a theme never recolors a certificate.
 */
export function getCertificatePalette(themeId: number): CertificatePalette {
  const count = CERTIFICATE_PALETTES.length;
  const index = ((Math.trunc(themeId) % count) + count) % count;
  return CERTIFICATE_PALETTES[index];
}
