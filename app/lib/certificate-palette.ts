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
