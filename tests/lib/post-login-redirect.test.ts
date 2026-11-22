import { describe, expect, it } from "vitest";
import { buildLoginPath, sanitizePostLoginPath } from "@/app/lib/post-login-redirect";

describe("sanitizePostLoginPath", () => {
  it.each([
    ["/playground", "/playground"],
    ["/playground/t/abcdefghij", "/playground/t/abcdefghij"],
    ["/learn/1/2/3?tab=article", "/learn/1/2/3?tab=article"],
    ["/a/../playground", "/playground"],
  ])("サイト内のパス %s は %s として通す", (raw, expected) => {
    expect(sanitizePostLoginPath(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "/",
    "playground",
    "https://evil.example/",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "/%5Cevil.example",
    "/%2F%2Fevil.example",
    "/%2f/evil.example",
    "/play\tground",
    "/play\nground",
    "javascript:alert(1)",
    "/login",
    "/login?next=/playground",
    "/auth/callback?code=x",
    "/auth/signout",
    "/rejected",
    "/api/manage/playground-templates",
    `/${"a".repeat(600)}`,
  ])("サイトの外・ループ・不正な値 %s は null", (raw) => {
    expect(sanitizePostLoginPath(raw)).toBeNull();
  });

  it("戻り先にハッシュは含めない（サーバーには届かないため）", () => {
    expect(sanitizePostLoginPath("/playground#top")).toBe("/playground");
  });
});

describe("buildLoginPath", () => {
  it("戻り先とエラーを付ける", () => {
    const url = new URL(buildLoginPath("/playground?x=1", "terms_required"), "https://a.example");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("terms_required");
    expect(url.searchParams.get("next")).toBe("/playground?x=1");
  });

  it("使えない戻り先は付けない", () => {
    expect(buildLoginPath("//evil.example")).toBe("/login");
    expect(buildLoginPath(null, "terms_required")).toBe("/login?error=terms_required");
  });
});
