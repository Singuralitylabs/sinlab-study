/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(authenticated)/upgrade/UpgradeCheckoutButton", () => ({
  UpgradeCheckoutButton: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="checkout">{disabled ? "checkout-disabled" : "checkout"}</div>
  ),
}));
vi.mock("@/app/(authenticated)/upgrade/CommunityApplyButton", () => ({
  CommunityApplyButton: () => (
    <a href="https://example.com/form" target="_blank" rel="noopener noreferrer">
      申し込む
    </a>
  ),
}));
vi.mock("@/app/(authenticated)/upgrade/PlanInquiryButton", () => ({
  PlanInquiryButton: () => <div>inquiry-compact</div>,
}));

import { PlanCards } from "@/app/(authenticated)/upgrade/PlanCards";
import { SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE } from "@/app/constants/stripe";

describe("PlanCards モーダル", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("一般有料カードのモーダルでは法定表示・未成年者注意が Checkout より前にある", async () => {
    const legalItem = "すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます";
    const minorNotice =
      "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";

    await act(async () => {
      root.render(
        <PlanCards
          generalPriceLabel={null}
          generalDialog={
            <div>
              <p>—</p>
              <ul>
                <li>{legalItem}</li>
              </ul>
              <p>{minorNotice}</p>
              <p>{SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE}</p>
              <div data-testid="checkout">checkout-disabled</div>
            </div>
          }
          communityDialog={<p>community body</p>}
        />
      );
    });

    const generalDetail = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("一般有料会員")
    );
    expect(generalDetail).toBeTruthy();

    await act(async () => {
      generalDetail?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog).toBeTruthy();
    const text = dialog?.textContent ?? "";
    expect(text.indexOf(legalItem)).toBeLessThan(text.indexOf(minorNotice));
    expect(text.indexOf(minorNotice)).toBeLessThan(
      text.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)
    );
    expect(text.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)).toBeLessThan(
      text.indexOf("checkout-disabled")
    );
  });

  it("コミュニティカードのモーダルに申し込み導線を出す", async () => {
    await act(async () => {
      root.render(
        <PlanCards
          generalDialog={<p>general</p>}
          communityDialog={
            <div>
              <p>申し込みフォームからお申し込みください</p>
              <a href="https://example.com/form" target="_blank" rel="noopener noreferrer">
                申し込む
              </a>
              <div>inquiry-compact</div>
            </div>
          }
        />
      );
    });

    const communityDetail = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("コミュニティ会員")
    );
    expect(communityDetail).toBeTruthy();

    await act(async () => {
      communityDetail?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    const text = dialog?.textContent ?? "";
    expect(text).toContain("申し込みフォームからお申し込みください");
    expect(text).toContain("申し込む");
    expect(text).toContain("inquiry-compact");
    expect(dialog?.querySelector('a[rel="noopener noreferrer"]')).toBeTruthy();
  });

  it("コミュニティ特典を箇条書きで表示する", async () => {
    await act(async () => {
      root.render(<PlanCards generalDialog={<p>g</p>} communityDialog={<p>c</p>} />);
    });

    expect(container.textContent).toContain("Slackでのコミュニケーション");
    expect(container.textContent).toContain("Web/AIの最新情報");
    expect(container.querySelectorAll("ul li").length).toBeGreaterThanOrEqual(6);
  });
});
