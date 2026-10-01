import { describe, expect, it } from "vitest";
import { DISPLAY_MONTHLY_PRICE_JPY, UPGRADE_BENEFITS } from "@/app/constants/stripe";
import {
  getLockedContentFallbackOverview,
  resolveUpgradePriceLabel,
  shouldShowTrialNextStep,
} from "@/app/lib/trial-upgrade";

const done = [{ totalContents: 2, completedContents: 2 }];

describe("shouldShowTrialNextStep", () => {
  it("trial の member が全テーマ完了なら表示する", () => {
    expect(shouldShowTrialNextStep("trial", "member", done)).toBe(true);
  });

  it("trial 以外・member 以外は表示しない", () => {
    expect(shouldShowTrialNextStep("active", "member", done)).toBe(false);
    expect(shouldShowTrialNextStep("trial", "admin", done)).toBe(false);
    expect(shouldShowTrialNextStep("trial", "maintainer", done)).toBe(false);
    expect(shouldShowTrialNextStep(null, null, done)).toBe(false);
  });

  it("完了率100%未満のテーマが1つでもあれば表示しない", () => {
    expect(
      shouldShowTrialNextStep("trial", "member", [
        ...done,
        { totalContents: 3, completedContents: 2 },
      ])
    ).toBe(false);
  });

  it("お試し公開が0件なら表示しない", () => {
    expect(shouldShowTrialNextStep("trial", "member", [])).toBe(false);
    expect(
      shouldShowTrialNextStep("trial", "member", [{ totalContents: 0, completedContents: 0 }])
    ).toBe(false);
  });
});

describe("resolveUpgradePriceLabel", () => {
  it("取得できた実額を優先する", () => {
    expect(
      resolveUpgradePriceLabel({ status: "ok", price: { amount: 3000, currency: "jpy" } })
    ).toBe("月額3,000円（税込）");
  });

  it("取得失敗時は DISPLAY_MONTHLY_PRICE_JPY にフォールバックする", () => {
    expect(resolveUpgradePriceLabel({ status: "failed" })).toBe(
      `月額${DISPLAY_MONTHLY_PRICE_JPY.toLocaleString("ja-JP")}円（税込）`
    );
  });

  it("非月額・非JPYの Price では金額を断定しない", () => {
    expect(
      resolveUpgradePriceLabel({ status: "ok", price: { amount: null, currency: "jpy" } })
    ).toBeNull();
  });
});

describe("定型文・価値訴求", () => {
  it("コンテンツ種別ごとの定型文がある", () => {
    expect(getLockedContentFallbackOverview("video")).toBe("このコンテンツでは動画で学びます");
  });

  it("価値は3点", () => {
    expect(UPGRADE_BENEFITS).toHaveLength(3);
  });
});
