import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  installPromptPlatform,
  isMobileUserAgent,
  PWA_PUBLIC_PATHS,
  shouldShowInstallPrompt,
} from "@/app/constants/pwa";
import { shouldSkipMiddleware } from "@/proxy";

describe("PWA のプロキシ除外", () => {
  it("追加 4 パスだけを通し、配下や別マニフェスト名は追加しない", () => {
    for (const path of PWA_PUBLIC_PATHS) {
      expect(shouldSkipMiddleware(path)).toBe(true);
    }
    expect(shouldSkipMiddleware("/offline/anything")).toBe(false);
    expect(PWA_PUBLIC_PATHS).not.toContain("/manifest.json");
    expect(PWA_PUBLIC_PATHS).toHaveLength(4);
  });
});

describe("インストール案内の表示条件", () => {
  it("モバイルのブラウザだけで、standalone と閉じたあとは出さない", () => {
    expect(shouldShowInstallPrompt({ isStandalone: false, isMobile: true, dismissed: false })).toBe(
      true
    );
    expect(shouldShowInstallPrompt({ isStandalone: true, isMobile: true, dismissed: false })).toBe(
      false
    );
    expect(
      shouldShowInstallPrompt({ isStandalone: false, isMobile: false, dismissed: false })
    ).toBe(false);
    expect(shouldShowInstallPrompt({ isStandalone: false, isMobile: true, dismissed: true })).toBe(
      false
    );
  });

  it("iOS は共有手順、Android はインストールプロンプト側", () => {
    expect(installPromptPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "ios"
    );
    expect(installPromptPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0")).toBe(
      "android"
    );
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
    expect(isMobileUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
  });
});

describe("public/sw.js", () => {
  const source = readFileSync("public/sw.js", "utf8");

  it("ナビゲーションはネットワーク優先で、失敗時は install で入れた /offline を返す", () => {
    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain('const OFFLINE_URL = "/offline"');
    expect(source).toContain("caches.match(OFFLINE_URL)");
    expect(source).toMatch(/"install"[\s\S]*cache\.add\(OFFLINE_URL\)/);
  });

  it("ハッシュの無いアイコンは network-first、/_next/static は cache-first。/api は含めない", () => {
    expect(source).toContain('pathname.startsWith("/_next/static/")');
    expect(source).toContain('pathname.startsWith("/icons/")');
    expect(source).toContain("event.respondWith(networkFirst(request))");
    expect(source).toContain("event.respondWith(cacheFirst(request))");
    const networkFirst = source.slice(
      source.indexOf("function networkFirst"),
      source.indexOf("function cacheFirst")
    );
    expect(networkFirst.indexOf("fetch(request)")).toBeLessThan(
      networkFirst.indexOf("caches.match")
    );
    expect(source).not.toContain('"/api');
  });
});
