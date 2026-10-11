import { describe, expect, it } from "vitest";
import { ANALYTICS_PROPERTY_KEYS, sanitizeAnalyticsProperties } from "@/app/constants/analytics";
import {
  isExternalCheckoutUrl,
  shouldTrackCheckoutCompleted,
  shouldTrackFirstCompletion,
  shouldTrackFirstSubmission,
} from "@/app/lib/analytics-funnel";

describe("初回判定", () => {
  it("完了にしたとき、既存の完了行が 0 件なら初めて", () => {
    expect(shouldTrackFirstCompletion(true, 0)).toBe(true);
  });

  it("既に完了行がある、または未完了への更新では送らない", () => {
    expect(shouldTrackFirstCompletion(true, 1)).toBe(false);
    expect(shouldTrackFirstCompletion(false, 0)).toBe(false);
  });

  it("提出は既存が 0 件のときだけ初めて", () => {
    expect(shouldTrackFirstSubmission(0)).toBe(true);
    expect(shouldTrackFirstSubmission(1)).toBe(false);
  });

  it("checkout_completed は昇格で行が変わった初回だけ", () => {
    expect(shouldTrackCheckoutCompleted(true, true)).toBe(true);
    expect(shouldTrackCheckoutCompleted(true, false)).toBe(false);
    expect(shouldTrackCheckoutCompleted(false, false)).toBe(false);
  });
});

describe("Checkout URL", () => {
  it("Stripe の Checkout URL だけを外部決済 URL とみなす", () => {
    expect(isExternalCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test")).toBe(true);
    expect(isExternalCheckoutUrl("/upgrade")).toBe(false);
    expect(isExternalCheckoutUrl("/upgrade/success?session_id=cs_test")).toBe(false);
    expect(isExternalCheckoutUrl("https://example.com/upgrade")).toBe(false);
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("許可キーは status / content_type / source だけ", () => {
    expect([...ANALYTICS_PROPERTY_KEYS]).toEqual(["status", "content_type", "source"]);
  });

  it("メールアドレス・表示名・ユーザー ID は残さない", () => {
    expect(
      sanitizeAnalyticsProperties({
        status: "trial",
        content_type: "slide",
        source: "banner",
        email: "user@example.com",
        display_name: "表示名",
        displayName: "表示名",
        user_id: "12",
        userId: "12",
        auth_id: "uuid",
        name: "表示名",
      })
    ).toEqual({ status: "trial", content_type: "slide", source: "banner" });
  });

  it("許可キーでも @ を含む値は捨てる", () => {
    expect(sanitizeAnalyticsProperties({ status: "user@example.com" })).toBeUndefined();
  });
});
