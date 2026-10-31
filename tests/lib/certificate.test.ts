import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCertificateFacebookShareUrl,
  buildCertificateLineShareUrl,
  buildCertificateShareUrl,
  dashboardCertificateCutoff,
  isCertificateEligible,
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

describe("ダッシュボード表示期間（14日）", () => {
  const now = new Date("2026-10-20T00:00:00Z");

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

describe("buildCertificateLineShareUrl", () => {
  it("url にログインページ、text に本文を入れる", () => {
    const url = new URL(
      buildCertificateLineShareUrl("GAS 学習（基礎編）", "https://study.example.com/") ?? ""
    );

    expect(url.origin + url.pathname).toBe("https://social-plugins.line.me/lineit/share");
    expect(url.searchParams.get("url")).toBe("https://study.example.com/login");
    expect(url.searchParams.get("text")).toBe("『GAS 学習（基礎編）』を修了しました #SinlabStudy");
  });

  it("アプリ URL が未設定なら null", () => {
    expect(buildCertificateLineShareUrl("テーマ", null)).toBeNull();
  });
});

describe("buildCertificateFacebookShareUrl", () => {
  it("u にログインページ、hashtag に # 付きの 1 つを入れる（本文は載せない）", () => {
    const url = new URL(buildCertificateFacebookShareUrl("https://study.example.com") ?? "");

    expect(url.origin + url.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(url.searchParams.get("u")).toBe("https://study.example.com/login");
    expect(url.searchParams.get("hashtag")).toBe("#SinlabStudy");
    expect(url.searchParams.has("text")).toBe(false);
  });

  it("アプリ URL が未設定なら null", () => {
    expect(buildCertificateFacebookShareUrl(null)).toBeNull();
  });
});

describe("クライアントから到達するモジュールの境界", () => {
  it("certificate.ts は Node 組み込みモジュールを import しない（crypto-browserify の混入防止）", () => {
    const source = readFileSync("app/lib/certificate.ts", "utf8");
    expect(source).not.toMatch(/from "node:/);
    expect(source).not.toMatch(/from "crypto"/);
  });
});
