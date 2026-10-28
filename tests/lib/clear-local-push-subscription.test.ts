import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ログアウト時のプッシュ購読解除", () => {
  it("サイドナビと却下画面の両方が共通の signOutAndRedirect を使う", () => {
    const sideNav = readFileSync("app/(authenticated)/components/SideNav.tsx", "utf8");
    const rejected = readFileSync("app/(auth)/rejected/page.tsx", "utf8");
    for (const source of [sideNav, rejected]) {
      expect(source).toContain('from "@/app/lib/sign-out"');
      expect(source).toContain("signOutAndRedirect()");
      // supabase-js must not come back into these bundles for sign-out alone.
      expect(source).not.toContain("supabase-client");
    }
  });

  it("購読解除をサインアウト要求より先に行う", () => {
    const source = readFileSync("app/lib/sign-out.ts", "utf8");
    expect(source).toContain("await clearLocalPushSubscription()");
    const clearAt = source.indexOf("await clearLocalPushSubscription()");
    const signOutAt = source.indexOf("fetch(SIGN_OUT_PATH");
    expect(clearAt).toBeGreaterThan(-1);
    expect(signOutAt).toBeGreaterThan(clearAt);
  });

  it("DELETE に AbortSignal のタイムアウトを付け、オフラインでログアウトを止めない", () => {
    const source = readFileSync("app/lib/clear-local-push-subscription.ts", "utf8");
    expect(source).toContain("CLEAR_LOCAL_PUSH_FETCH_TIMEOUT_MS");
    expect(source).toContain("AbortController");
    expect(source).toContain("signal: controller.signal");
  });
});
