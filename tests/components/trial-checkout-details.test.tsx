/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(authenticated)/upgrade/UpgradeCheckoutButton", () => ({
  UpgradeCheckoutButton: ({ disabled, plan }: { disabled?: boolean; plan?: string }) =>
    createElement(
      "div",
      { "data-testid": "checkout", "data-plan": plan },
      disabled ? "checkout-disabled" : "checkout"
    ),
}));

import { TrialCheckoutDetails } from "@/app/(authenticated)/upgrade/TrialCheckoutDetails";
import {
  CANCELLATION_POLICY_TEXT,
  PROMOTION_CODE_NOTICE,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";

const MONTHLY_OFFER = {
  plan: "monthly",
  priceLabel: "月額1,500円（税込）",
  checkoutDisabled: false,
} as const;

const YEARLY_OFFER = {
  plan: "yearly",
  priceLabel: "年額15,000円（税込）",
  checkoutDisabled: false,
} as const;

describe("TrialCheckoutDetails", () => {
  it("法定表示・未成年者注意・無効理由・Checkout の順で並べる", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails
        offers={[{ plan: "monthly", priceLabel: null, checkoutDisabled: true }]}
      />
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
    const html = renderToStaticMarkup(<TrialCheckoutDetails offers={[MONTHLY_OFFER]} />);

    expect(html).toContain("月額1,500円（税込）");
    expect(html).not.toContain(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE);
    expect(html).toContain(">checkout<");
  });

  it("決済日は契約日基準で、初回は1か月分の満額と案内する（固定日・日割りの案内を出さない）", () => {
    const html = renderToStaticMarkup(<TrialCheckoutDetails offers={[MONTHLY_OFFER]} />);

    expect(html).toContain("お申し込み時に、初回分として1か月分の料金をお支払いいただきます");
    expect(html).toContain("以後は1か月ごとに自動で更新・請求されます");
    expect(html).toContain(CANCELLATION_POLICY_TEXT);
    expect(html).not.toContain("全員一律");
    expect(html).not.toContain("日割り料金");
  });

  it("プロモーションコードの案内をCheckoutボタンの前に出す", () => {
    const html = renderToStaticMarkup(<TrialCheckoutDetails offers={[MONTHLY_OFFER]} />);

    expect(html).toContain(PROMOTION_CODE_NOTICE);
    expect(html.indexOf(PROMOTION_CODE_NOTICE)).toBeLessThan(html.indexOf(">checkout<"));
  });

  it("年額がなければプランの選択肢を出さない", () => {
    const html = renderToStaticMarkup(<TrialCheckoutDetails offers={[MONTHLY_OFFER]} />);

    expect(html).not.toContain("プランを選択");
    expect(html).toContain('data-plan="monthly"');
  });

  it("年額があれば選択肢を出し、最初は月額の法定表示と Checkout にする", () => {
    const html = renderToStaticMarkup(
      <TrialCheckoutDetails offers={[MONTHLY_OFFER, YEARLY_OFFER]} />
    );

    expect(html).toContain("プランを選択");
    expect(html).toContain("年額15,000円（税込）");
    expect(html).toContain("毎月自動で更新・請求されます");
    expect(html).not.toContain("1年分の料金");
    expect(html).toContain('data-plan="monthly"');
  });
});

describe("TrialCheckoutDetails（年額を選んだとき）", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("法定表示を年額の内容に切り替え、Checkout に年額を渡す", () => {
    act(() => {
      root.render(<TrialCheckoutDetails offers={[MONTHLY_OFFER, YEARLY_OFFER]} />);
    });
    const yearlyRadio = container.querySelector<HTMLInputElement>('input[value="yearly"]');
    act(() => {
      yearlyRadio?.click();
    });

    const text = container.textContent ?? "";
    expect(text).toContain(
      "年額サブスクリプション（自動更新）です。解約手続きをしない限り、毎年自動で更新・請求されます"
    );
    expect(text).toContain("お申し込み時に、初回分として1年分の料金をお支払いいただきます");
    expect(text).toContain("以後は1年ごとに自動で更新・請求されます");
    expect(text).not.toContain("1か月分");
    expect(text).toContain(CANCELLATION_POLICY_TEXT);
    expect(container.querySelector('[data-testid="checkout"]')?.getAttribute("data-plan")).toBe(
      "yearly"
    );
  });

  it("年額の料金を確認できないときは、年額を選ぶと Checkout を無効にする", () => {
    act(() => {
      root.render(
        <TrialCheckoutDetails
          offers={[MONTHLY_OFFER, { ...YEARLY_OFFER, checkoutDisabled: true }]}
        />
      );
    });
    act(() => {
      container.querySelector<HTMLInputElement>('input[value="yearly"]')?.click();
    });

    expect(container.textContent).toContain(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE);
    expect(container.textContent).toContain("checkout-disabled");
  });
});
