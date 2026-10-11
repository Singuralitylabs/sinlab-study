/**
 * Parse form values/query strings into a safe integer >= 1, else null. Number.parseInt() partially
 * parses "1abc" or "1.5" as 1, so don't use it: check that the whole string is digits only (no
 * surrounding whitespace, sign, decimal point, exponent or full-width digits) before passing it to
 * Number(). FormData may hold a File, so non-strings return null.
 */
export function parsePositiveInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
