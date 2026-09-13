import { SUBMISSIONS_PAGE_SIZE } from "@/app/constants/submissions";
import { parsePositiveInteger } from "@/app/lib/positive-integer";

/**
 * searchParams の page を1以上の整数へ解釈する。未指定・不正値は1。
 * Number.parseInt の部分解釈（"3abc"→3 等）を避けるため parsePositiveInteger を使う。
 */
export function parsePageParam(value: string | undefined): number {
  return parsePositiveInteger(value ?? null) ?? 1;
}

/**
 * page / pageSize を1以上の整数に正規化し、PostgREST `.range(from, to)` の引数を返す。
 */
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

/** 総件数から総ページ数を算出（最低1） */
export function calcTotalPages(count: number, pageSize: number = SUBMISSIONS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

/**
 * 範囲外ページへ誘導すべきか。
 * - PostgREST の range 超過（PGRST103）
 * - エラーなしでページ>1 かつ0件（境界外の空結果）
 * それ以外の DB エラーは呼び出し元でエラー表示する。
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
  // 一時的な DB エラー（data null）はリダイレクトせず、呼び出し元でエラー表示する
  if (errorCode) {
    return false;
  }
  return dataLength === 0;
}
