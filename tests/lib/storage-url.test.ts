import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStorageUrl } from "@/app/lib/storage-url";

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
    "/images/themes/gas_icon.png",
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
