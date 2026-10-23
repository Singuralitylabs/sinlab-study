import {
  MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
  MARKDOWN_IMAGE_MAX_WIDTH_PX,
  MARKDOWN_IMAGE_MIN_WIDTH_PX,
} from "@/app/constants/markdown";

/** Title that looks like a width directive (`w=...`), including invalid values. */
const WIDTH_DIRECTIVE_PATTERN = /^\s*w=(.*)$/i;

/** Captures ASCII digits only after `w=` (optional surrounding spaces already trimmed in group). */
const WIDTH_VALUE_PATTERN = /^\d+$/;

export type MarkdownImageWidthResult = {
  /** Pixel width when `w=` is valid; otherwise the default max width. */
  widthPx: number;
  /** True when width came from a valid `w=` title (set as CSS `width`). */
  hasExplicitWidth: boolean;
  /** Tooltip title; omitted when the title was a `w=` directive (valid or not). */
  displayTitle: string | undefined;
};

/**
 * Resolve Markdown image title into display width. `w=<digits>` is a width directive (not a
 * tooltip). Invalid or out-of-range values fall back to the default max width and still strip
 * the title so the raw directive never appears as a tooltip.
 */
export function resolveMarkdownImageWidth(
  title: string | undefined | null
): MarkdownImageWidthResult {
  if (title == null || title === "") {
    return {
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    };
  }

  const directive = WIDTH_DIRECTIVE_PATTERN.exec(title);
  if (!directive) {
    return {
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: title,
    };
  }

  const rawValue = directive[1].trim();
  if (!WIDTH_VALUE_PATTERN.test(rawValue)) {
    return {
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    };
  }

  const parsed = Number(rawValue);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MARKDOWN_IMAGE_MIN_WIDTH_PX ||
    parsed > MARKDOWN_IMAGE_MAX_WIDTH_PX
  ) {
    return {
      widthPx: MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX,
      hasExplicitWidth: false,
      displayTitle: undefined,
    };
  }

  return {
    widthPx: parsed,
    hasExplicitWidth: true,
    displayTitle: undefined,
  };
}
