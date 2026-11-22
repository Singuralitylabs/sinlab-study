/** Same shape as the learning_themes_theme_color_check constraint; keep the two in step. */
export const THEME_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function isThemeColor(value: string): boolean {
  return THEME_COLOR_PATTERN.test(value);
}

/**
 * Trimmed, upper-cased `#RRGGBB`, or null for blank/invalid input. Upper case keeps stored values
 * comparable regardless of how the picker or a person typed them.
 */
export function normalizeThemeColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return isThemeColor(trimmed) ? trimmed.toUpperCase() : null;
}
