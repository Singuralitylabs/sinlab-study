/**
 * フォーム値・クエリ文字列を1以上の安全な整数へ解釈する。解釈できなければ null を返す。
 *
 * Number.parseInt() は "1abc" や "1.5" を 1 として部分解釈してしまうため使わず、
 * 文字列全体が数字のみ（前後の空白・符号・小数点・指数表記・全角数字を含まない）で
 * あることを確認したうえで Number() に渡す。
 * FormData には File が入り得るため、文字列以外は解釈せず null を返す。
 */
export function parsePositiveInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
