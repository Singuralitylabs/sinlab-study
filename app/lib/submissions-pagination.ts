import { SUBMISSIONS_PAGE_SIZE } from "@/app/constants/submissions";
import { parsePositiveInteger } from "@/app/lib/positive-integer";

/**
 * Parse the page param as an integer >= 1 (missing/invalid = 1). Uses parsePositiveInteger to avoid
 * Number.parseInt's partial parsing ("3abc" -> 3).
 */
export function parsePageParam(value: string | undefined): number {
  return parsePositiveInteger(value ?? null) ?? 1;
}

export function resolvePageRange(
  page: number,
  pageSize: number = SUBMISSIONS_PAGE_SIZE
): { page: number; pageSize: number; from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const from = (safePage - 1) * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    from,
    to: from + safePageSize - 1,
  };
}

export function calcTotalPages(count: number, pageSize: number = SUBMISSIONS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/**
 * Whether to redirect to an out-of-range page: PostgREST range overflow (PGRST103), or no error but
 * page > 1
 * with zero rows. Other DB errors are shown by the caller.
 */
export function shouldRedirectOutOfRangePage({
  page,
  dataLength,
  errorCode,
}: {
  page: number;
  dataLength: number;
  errorCode: string | undefined;
}): boolean {
  if (page <= 1) {
    return false;
  }
  if (errorCode === "PGRST103") {
    return true;
  }
  // Transient DB errors (data null) must not redirect; the caller shows the error.
  if (errorCode) {
    return false;
  }
  return dataLength === 0;
}
