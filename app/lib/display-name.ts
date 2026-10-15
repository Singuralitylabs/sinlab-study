import { DISPLAY_NAME_MAX_LENGTH } from "@/app/constants/user";

export type DisplayNameParseResult = { ok: true; name: string } | { ok: false; message: string };

// Control characters and Unicode line separators. trim() already drops leading and trailing
// whitespace, including a newline; anything left would be printed on the certificate as-is.
const CONTROL_OR_LINE_BREAK = /\p{Cc}|\p{Zl}|\p{Zp}/u;

/**
 * Trims and checks a display name. The settings form and the API schema both call this so the
 * empty / length / control-character rules cannot drift.
 */
export function parseDisplayName(raw: string): DisplayNameParseResult {
  const name = raw.trim();
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
