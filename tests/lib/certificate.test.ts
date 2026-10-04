import { describe, expect, it } from "vitest";
import {
  buildCertificateShareUrl,
  dashboardCertificateCutoff,
  generateCertificateNo,
  isCertificateEligible,
  isRecentlyIssued,
  isThemeCompleted,
} from "@/app/lib/certificate";

describe("isCertificateEligible", () => {
  it("active の member だけが対象", () => {
    expect(isCertificateEligible("active", "member")).toBe(true);
  });

  it.each([
    ["trial", "member"],
    ["rejected", "member"],
    ["active", "admin"],
    ["active", "maintainer"],
    [null, "member"],
    ["active", null],
  ] as const)("status=%s role=%s は対象外", (status, role) => {
    expect(isCertificateEligible(status, role)).toBe(false);
  });
});

describe("isThemeCompleted", () => {
  it("公開コンテンツがすべて完了していれば修了", () => {
    expect(isThemeCompleted({ totalContents: 3, completedContents: 3 })).toBe(true);
  });

  it("未完了が1件でもあれば修了ではない", () => {
    expect(isThemeCompleted({ totalContents: 3, completedContents: 2 })).toBe(false);
  });

  it("公開コンテンツが0件のテーマは修了にならない", () => {
    expect(isThemeCompleted({ totalContents: 0, completedContents: 0 })).toBe(false);
  });
});

describe("generateCertificateNo", () => {
  it("SS-YYYYMM-XXXXXX 形式（DB の CHECK と同じ形）", () => {
    const no = generateCertificateNo(new Date("2026-10-04T03:00:00Z"));
    expect(no).toMatch(/^SS-202610-[0-9A-Z]{6}$/);
  });

  it("年月は JST で数える（UTC では前月末でも JST の月になる）", () => {
    expect(generateCertificateNo(new Date("2026-09-30T15:30:00Z"))).toMatch(/^SS-202610-/);
    expect(generateCertificateNo(new Date("2026-12-31T14:59:00Z"))).toMatch(/^SS-202612-/);
    expect(generateCertificateNo(new Date("2026-12-31T15:00:00Z"))).toMatch(/^SS-202701-/);
  });

  it("乱数部は注入した乱数から決まる（紛らわしい I / O を含まない文字種）", () => {
    expect(generateCertificateNo(new Date("2026-10-04T00:00:00Z"), () => 0)).toBe(
      "SS-202610-000000"
    );
    const all = Array.from({ length: 200 }, () => generateCertificateNo(new Date()));
    expect(all.every((no) => !/[IO]/.test(no.slice(10)))).toBe(true);
  });
});

describe("ダッシュボード表示期間（14日）", () => {
  const now = new Date("2026-10-20T00:00:00Z");

  it("発行から14日以内は表示、超えたら表示しない", () => {
    expect(isRecentlyIssued("2026-10-06T00:00:00Z", now)).toBe(true);
    expect(isRecentlyIssued("2026-10-05T23:59:59Z", now)).toBe(false);
  });

  it("不正な日時は表示しない", () => {
    expect(isRecentlyIssued("invalid", now)).toBe(false);
  });

  it("DB 絞り込み用の下限は14日前", () => {
    expect(dashboardCertificateCutoff(now)).toBe("2026-10-06T00:00:00.000Z");
  });
});

describe("buildCertificateShareUrl", () => {
  it("本文にテーマ名とハッシュタグ、url にログインページを入れる（修了証ページの URL は入れない）", () => {
    const url = new URL(
      buildCertificateShareUrl("GAS 学習（基礎編）", "https://study.example.com/")
    );

    expect(url.origin + url.pathname).toBe("https://twitter.com/intent/tweet");
    expect(url.searchParams.get("text")).toBe("『GAS 学習（基礎編）』を修了しました #SinlabStudy");
    expect(url.searchParams.get("url")).toBe("https://study.example.com/login");
  });

  it("アプリ URL が未設定なら url を付けない", () => {
    const url = new URL(buildCertificateShareUrl("テーマ", null));
    expect(url.searchParams.has("url")).toBe(false);
  });
});
