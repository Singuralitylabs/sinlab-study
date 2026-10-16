import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ログアウト時のプッシュ購読解除", () => {
  it("サイドナビと却下画面の両方で clearLocalPushSubscription を呼ぶ", () => {
    const sideNav = readFileSync("app/(authenticated)/components/SideNav.tsx", "utf8");
    const rejected = readFileSync("app/(auth)/rejected/page.tsx", "utf8");
    for (const source of [sideNav, rejected]) {
      expect(source).toContain('from "@/app/lib/clear-local-push-subscription"');
      expect(source).toContain("await clearLocalPushSubscription()");
      const clearAt = source.indexOf("await clearLocalPushSubscription()");
      const signOutAt = source.indexOf("signOut(");
      expect(clearAt).toBeGreaterThan(-1);
      expect(signOutAt).toBeGreaterThan(clearAt);
    }
  });
});
