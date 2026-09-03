import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMarkdownStorageUrls, resolveStorageUrl } from "@/app/lib/storage-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveStorageUrl", () => {
  it("Storageの相対パスにSupabase URLを前置する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(
      resolveStorageUrl("/storage/v1/object/public/thumbnails/theme-1/thumbnail.png?v=1")
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-1/thumbnail.png?v=1"
    );
  });

  it("Supabase URL末尾のスラッシュを除去して結合する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");

    expect(resolveStorageUrl("/storage/v1/object/public/thumbnails/theme-1/thumbnail.png")).toBe(
      "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-1/thumbnail.png"
    );
  });

  it.each([
    "https://example.com/image.png",
    "/images/themes/example.png",
  ])("既存URLは変更しない: %s", (url) => {
    expect(resolveStorageUrl(url)).toBe(url);
  });

  it("Supabase URLが未設定なら相対パスをそのまま返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(resolveStorageUrl("/storage/v1/object/public/thumbnails/theme-1/thumbnail.png")).toBe(
      "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png"
    );
  });
});

describe("resolveMarkdownStorageUrls", () => {
  it("Markdown内の {{SUPABASE_STORAGE_URL}} をStorageの公開URLプレフィックスへ置換する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(
      resolveMarkdownStorageUrls("![sample]({{SUPABASE_STORAGE_URL}}/thumbnails/sample.png)")
    ).toBe("![sample](https://project.supabase.co/storage/v1/object/public/thumbnails/sample.png)");
  });

  it("複数出現する場合はすべて置換する", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(
      resolveMarkdownStorageUrls("{{SUPABASE_STORAGE_URL}}/a.png {{SUPABASE_STORAGE_URL}}/b.png")
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/a.png https://project.supabase.co/storage/v1/object/public/b.png"
    );
  });

  it("プレースホルダを含まない場合はそのまま返す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    expect(resolveMarkdownStorageUrls("# 見出し\n本文です")).toBe("# 見出し\n本文です");
  });
});
