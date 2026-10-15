import { DISPLAY_NAME_MAX_LENGTH } from "@/app/constants/user";

export type DisplayNameParseResult = { ok: true; name: string } | { ok: false; message: string };

// Control characters and Unicode line separators. trim() already drops leading and trailing
// whitespace, including a newline; anything left would be printed on the certificate as-is.
const CONTROL_OR_LINE_BREAK = /\p{Cc}|\p{Zl}|\p{Zp}/u;

// Format characters (zero-width space, bidi overrides, …). trim() does not remove them, so a
// name made only of them looks blank and would be snapshotted onto a certificate that cannot
// be corrected. ZWJ (U+200D) is the exception: it joins emoji and is kept when other characters
// remain.
const FORMAT_CHAR = /\p{Cf}/gu;
const ZWJ = "\u200D";

/**
 * Visible name stored and printed. The settings form, the API schema, and certificate issuance
 * share this so a format-only string cannot pass one check and fail the other.
 */
export function normalizeDisplayName(raw: string): string {
  const stripped = raw
    .trim()
    .replace(FORMAT_CHAR, (char) => (char === ZWJ ? char : ""))
    .trim();
  // ZWJ is not whitespace, so it can sit outside spaces ("\u200D \u200D") and hide them from
  // trim(). Removing ZWJ without trimming again would store that blank string on the certificate.
  if (stripped.replaceAll(ZWJ, "").trim().length === 0) {
    return "";
  }
  return stripped;
}

/**
 * Trims and checks a display name. The settings form and the API schema both call this so the
 * empty / length / control-character rules cannot drift.
 */
export function parseDisplayName(raw: string): DisplayNameParseResult {
  const name = normalizeDisplayName(raw);
  if (name.length === 0) {
    return { ok: false, message: "表示名を入力してください" };
  }
  if (CONTROL_OR_LINE_BREAK.test(name)) {
    return { ok: false, message: "表示名に改行などの制御文字は使えません" };
  }
  // char_length (and the certificate) counts code points; a surrogate pair is one character.
  if ([...name].length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`,
    };
  }
  return { ok: true, name };
}
