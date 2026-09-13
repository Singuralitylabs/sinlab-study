import { describe, expect, it } from "vitest";
import {
  calcTotalPages,
  parsePageParam,
  resolvePageRange,
  shouldRedirectOutOfRangePage,
} from "@/app/lib/submissions-pagination";

describe("parsePageParam", () => {
  it("未指定・空・不正値は1を返す", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-1")).toBe(1);
    expect(parsePageParam("3abc")).toBe(1);
    expect(parsePageParam("1e9")).toBe(1);
  });

  it("正の整数文字列はその値を返す", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("42")).toBe(42);
  });
});

describe("resolvePageRange", () => {
  it("2ページ目・pageSize=20 は from=20 / to=39", () => {
    expect(resolvePageRange(2, 20)).toEqual({ page: 2, pageSize: 20, from: 20, to: 39 });
  });

  it("不正な page / pageSize を1以上に正規化する", () => {
    expect(resolvePageRange(0, Number.NaN)).toEqual({ page: 1, pageSize: 1, from: 0, to: 0 });
  });
});

describe("calcTotalPages", () => {
  it("件数0でも最低1ページ", () => {
    expect(calcTotalPages(0, 20)).toBe(1);
  });

  it("21件・pageSize=20 は2ページ", () => {
    expect(calcTotalPages(21, 20)).toBe(2);
  });
});

describe("shouldRedirectOutOfRangePage", () => {
  it("page=1 ではリダイレクトしない", () => {
    expect(shouldRedirectOutOfRangePage({ page: 1, dataLength: 0, errorCode: "PGRST103" })).toBe(
      false
    );
  });

  it("PGRST103 かつ page>1 ならリダイレクトする", () => {
    expect(shouldRedirectOutOfRangePage({ page: 2, dataLength: 0, errorCode: "PGRST103" })).toBe(
      true
    );
  });

  it("それ以外の DB エラーではリダイレクトしない（呼び出し元でエラー表示）", () => {
    expect(shouldRedirectOutOfRangePage({ page: 2, dataLength: 0, errorCode: "PGRST001" })).toBe(
      false
    );
  });

  it("エラーなしで page>1 かつ0件ならリダイレクトする", () => {
    expect(shouldRedirectOutOfRangePage({ page: 3, dataLength: 0, errorCode: undefined })).toBe(
      true
    );
  });

  it("エラーなしでデータがある場合はリダイレクトしない", () => {
    expect(shouldRedirectOutOfRangePage({ page: 2, dataLength: 5, errorCode: undefined })).toBe(
      false
    );
  });
});
