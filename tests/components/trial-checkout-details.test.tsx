import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(authenticated)/upgrade/UpgradeCheckoutButton", () => ({
  UpgradeCheckoutButton: ({ disabled }: { disabled?: boolean }) =>
    createElement(
      "div",
      { "data-testid": "checkout" },
      disabled ? "checkout-disabled" : "checkout"
    ),
}));

import { TrialCheckoutDetails } from "@/app/(authenticated)/upgrade/TrialCheckoutDetails";
import {
  CANCELLATION_POLICY_TEXT,
  PROMOTION_CODE_NOTICE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";

describe("TrialCheckoutDetails", () => {
  it("法定表示・未成年者注意・無効理由・Checkout の順で並べる", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails monthlyPriceLabel={null} checkoutDisabled={true} />
    );

    const legalItem = "すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます";
    const minorNotice =
      "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

    expect(html.indexOf(legalItem)).toBeLessThan(html.indexOf(minorNotice));
    expect(html.indexOf(minorNotice)).toBeLessThan(
      html.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)
    );
    expect(html.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)).toBeLessThan(
      html.indexOf("checkout-disabled")
    );
  });

  it("価格確認済みなら無効理由を出さず Checkout を有効にする", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails monthlyPriceLabel="月額1,500円（税込）" checkoutDisabled={false} />
    );

    expect(html).toContain("月額1,500円（税込）");
    expect(html).not.toContain(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE);
    expect(html).toContain(">checkout<");
  });

  it("決済日は契約日基準で、初回は1か月分の満額と案内する（固定日・日割りの案内を出さない）", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails monthlyPriceLabel="月額1,500円（税込）" checkoutDisabled={false} />
    );

    expect(html).toContain("お申し込み時に、初回分として1か月分の料金をお支払いいただきます");
    expect(html).toContain("以後は毎月、お申し込み日と同じ日が更新日となり");
    expect(html).toContain(CANCELLATION_POLICY_TEXT);
    expect(html).not.toContain("全員一律");
    expect(html).not.toContain("日割り料金");
  });

  it("プロモーションコードの案内をCheckoutボタンの前に出す", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails monthlyPriceLabel="月額1,500円（税込）" checkoutDisabled={false} />
    );

    expect(html).toContain(PROMOTION_CODE_NOTICE);
    expect(html.indexOf(PROMOTION_CODE_NOTICE)).toBeLessThan(html.indexOf(">checkout<"));
  });
});
