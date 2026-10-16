import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installPromptPlatform,
  isIosUserAgent,
  isMobileUserAgent,
  isStandaloneDisplay,
  PWA_PUBLIC_PATHS,
  shouldShowInstallPrompt,
} from "@/app/constants/pwa";
import manifest from "@/app/manifest";
import { shouldSkipMiddleware } from "@/proxy";

describe("PWA のプロキシ除外", () => {
  it("追加 4 パスだけを通し、配下や別マニフェスト名は追加しない", () => {
    for (const path of PWA_PUBLIC_PATHS) {
      expect(shouldSkipMiddleware(path)).toBe(true);
    }
    expect(shouldSkipMiddleware("/offline/anything")).toBe(false);
    expect(PWA_PUBLIC_PATHS).not.toContain("/manifest.json");
    expect(PWA_PUBLIC_PATHS).toHaveLength(4);
    expect(PWA_PUBLIC_PATHS).toContain("/offline");
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

  it("display-mode か navigator.standalone のどちらかでインストール済みとみなす", () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: undefined })
    ).toBe(false);
    expect(isStandaloneDisplay({ displayModeStandalone: true, navigatorStandalone: false })).toBe(
      true
    );
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(
      true
    );
  });

  it("iOS は共有手順、Android はインストールプロンプト側。iPadOS 13+ も iOS 扱い", () => {
    expect(installPromptPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "ios"
    );
    expect(installPromptPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0")).toBe(
      "android"
    );
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
    expect(isMobileUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(installPromptPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
  });
});

describe("manifest", () => {
  it("any と maskable の両方を 192 / 512 で載せる", () => {
    const { icons } = manifest();
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "192x192", purpose: "maskable" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ])
    );
    expect(icons?.filter((icon) => icon.purpose === "any")).toHaveLength(2);
    expect(icons?.filter((icon) => icon.purpose === "maskable")).toHaveLength(2);
  });
});

type SwListener = (event: Record<string, unknown>) => void;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function loadServiceWorker(options: { fetchImpl: FetchLike; origin?: string }) {
  const origin = options.origin ?? "https://example.com";
  const listeners = new Map<string, SwListener>();
  const cacheStore = new Map<string, Map<string, Response>>();
  const putCalls: Array<{ cacheName: string; url: string }> = [];

  const openCache = async (name: string) => {
    if (!cacheStore.has(name)) {
      cacheStore.set(name, new Map());
    }
    const store = cacheStore.get(name);
    if (!store) {
      throw new Error(`missing cache ${name}`);
    }
    return {
      add: async (url: string) => {
        store.set(new URL(url, origin).pathname, new Response("offline-html", { status: 200 }));
      },
      put: async (request: RequestInfo, response: Response) => {
        const url = typeof request === "string" ? request : request.url;
        putCalls.push({ cacheName: name, url });
        store.set(url, response);
      },
      match: async (request: RequestInfo) => {
        const key =
          typeof request === "string"
            ? request.startsWith("http")
              ? request
              : new URL(request, origin).pathname
            : request.url;
        return store.get(key) ?? store.get(new URL(key, origin).pathname) ?? undefined;
      },
    };
  };

  const caches = {
    open: openCache,
    match: async (request: RequestInfo) => {
      for (const store of cacheStore.values()) {
        const key =
          typeof request === "string"
            ? request.startsWith("http")
              ? request
              : new URL(request, origin).pathname
            : request.url;
        const hit = store.get(key) ?? store.get(new URL(key, origin).pathname);
        if (hit) {
          return hit;
        }
      }
      return undefined;
    },
    keys: async () => [...cacheStore.keys()],
    delete: async (name: string) => cacheStore.delete(name),
  };

  const self = {
    location: { origin },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: (type: string, handler: SwListener) => {
      listeners.set(type, handler);
    },
  };

  const source = readFileSync("public/sw.js", "utf8");
  // Service worker globals are injected; the file itself is not an ES module.
  new Function("self", "caches", "fetch", "Response", "URL", source)(
    self,
    caches,
    options.fetchImpl,
    Response,
    URL
  );

  return { listeners, putCalls, cacheStore, self, caches };
}

describe("public/sw.js の挙動", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ナビゲーション成功時は cache.put せず、失敗時は install 済み /offline を返す", async () => {
    const html = new Response("<html>home</html>", { status: 200 });
    const fetchImpl: FetchLike = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/") || new URL(url).pathname === "/") {
        return html;
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    const { listeners, putCalls, caches } = loadServiceWorker({ fetchImpl });

    const installEvent: { waitUntil: (promise: Promise<unknown>) => void; done: Promise<unknown> } =
      {
        waitUntil(promise) {
          installEvent.done = promise;
        },
        done: Promise.resolve(),
      };
    listeners.get("install")?.(installEvent);
    await installEvent.done;

    const navigateRequest = (url: string) =>
      ({
        method: "GET",
        mode: "navigate",
        url,
      }) as Request;

    const successEvent: {
      request: Request;
      respondWith: (value: Promise<Response>) => void;
      response?: Promise<Response>;
    } = {
      request: navigateRequest("https://example.com/"),
      respondWith(value) {
        successEvent.response = value;
      },
    };
    listeners.get("fetch")?.(successEvent);
    await expect(successEvent.response).resolves.toBe(html);
    expect(putCalls).toEqual([]);

    const failingFetch: FetchLike = async () => {
      throw new Error("offline");
    };
    const offlineSw = loadServiceWorker({ fetchImpl: failingFetch });
    const offlineInstall: {
      waitUntil: (promise: Promise<unknown>) => void;
      done: Promise<unknown>;
    } = {
      waitUntil(promise) {
        offlineInstall.done = promise;
      },
      done: Promise.resolve(),
    };
    offlineSw.listeners.get("install")?.(offlineInstall);
    await offlineInstall.done;

    const failEvent: {
      request: Request;
      respondWith: (value: Promise<Response | undefined>) => void;
      response?: Promise<Response | undefined>;
    } = {
      request: navigateRequest("https://example.com/learn"),
      respondWith(value) {
        failEvent.response = value;
      },
    };
    offlineSw.listeners.get("fetch")?.(failEvent);
    const offline = await failEvent.response;
    expect(offline).toBeDefined();
    expect(await offline?.text()).toBe("offline-html");
    expect(offlineSw.putCalls).toEqual([]);
    expect(await caches.keys()).toContain("sinlab-static-v2");
  });

  it("/api と認証 HTML 以外の経路でも navigate 以外で cache.put しない。activate は旧キャッシュを消す", async () => {
    const fetchImpl: FetchLike = async () => new Response("api", { status: 200 });
    const { listeners, putCalls, cacheStore, self } = loadServiceWorker({ fetchImpl });

    cacheStore.set("sinlab-static-v1", new Map([["/old", new Response("old")]]));
    cacheStore.set("sinlab-static-v2", new Map());

    const activateEvent: {
      waitUntil: (promise: Promise<unknown>) => void;
      done: Promise<unknown>;
    } = {
      waitUntil(promise) {
        activateEvent.done = promise;
      },
      done: Promise.resolve(),
    };
    listeners.get("activate")?.(activateEvent);
    await activateEvent.done;
    expect([...cacheStore.keys()]).toEqual(["sinlab-static-v2"]);
    expect(self.clients.claim).toHaveBeenCalledOnce();

    const apiEvent: {
      request: Request;
      respondWith: (value: Promise<Response>) => void;
      called?: boolean;
    } = {
      request: new Request("https://example.com/api/progress", { method: "GET" }),
      respondWith() {
        apiEvent.called = true;
      },
    };
    listeners.get("fetch")?.(apiEvent);
    expect(apiEvent.called).toBeUndefined();
    expect(putCalls).toEqual([]);
  });

  it("ソース上も navigate は network-first で /api を含めない", () => {
    const source = readFileSync("public/sw.js", "utf8");
    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain('const OFFLINE_URL = "/offline"');
    expect(source).toContain("caches.match(OFFLINE_URL)");
    expect(source).toMatch(/"install"[\s\S]*cache\.add\(OFFLINE_URL\)/);
    expect(source).toMatch(/"activate"[\s\S]*caches\.delete/);
    expect(source).toContain("sinlab-static-v2");
    expect(source).not.toContain('"/api');
  });
});
