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

import { CommunityApplyButton } from "@/app/(authenticated)/upgrade/CommunityApplyButton";
import { PlanCards } from "@/app/(authenticated)/upgrade/PlanCards";
import { TrialCheckoutDetails } from "@/app/(authenticated)/upgrade/TrialCheckoutDetails";
import {
  COMMUNITY_APPLY_FORM_URL,
  SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE,
} from "@/app/constants/stripe";

describe("PlanCards", () => {
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

  it("一般有料カードを開くと TrialCheckoutDetails の並びで Checkout より前に法定表示がある", async () => {
    await act(async () => {
      root.render(
        <PlanCards
          generalPriceLabel={null}
          generalDialog={<TrialCheckoutDetails monthlyPriceLabel={null} checkoutDisabled={true} />}
          communityDialog={<p>community body</p>}
        />
      );
    });

    const generalDetail = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("一般有料会員")
    );
    expect(generalDetail).toBeTruthy();
    expect(container.textContent).not.toContain("詳細を見る");

    await act(async () => {
      generalDetail?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog).toBeTruthy();
    const text = dialog?.textContent ?? "";
    const legalItem = "すべての学習コンテンツ（動画・テキスト・演習）を閲覧・提出できます";
    const minorNotice =
      "未成年者は保護者のアカウントにより、保護者の同意を得た上でお申し込みください";
    expect(text.indexOf(legalItem)).toBeLessThan(text.indexOf(minorNotice));
    expect(text.indexOf(minorNotice)).toBeLessThan(
      text.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)
    );
    expect(text.indexOf(SUBSCRIPTION_PRICE_UNAVAILABLE_MESSAGE)).toBeLessThan(
      text.indexOf("checkout-disabled")
    );
  });

  it("モーダルを開くカードに › を出し、開かないカードには出さない", async () => {
    await act(async () => {
      root.render(
        <PlanCards
          currentPlan="general"
          communityDialog={<p>community</p>}
          generalCardFooter={<p>manage footer</p>}
        />
      );
    });

    // Only community opens a dialog; general is current-plan with footer only.
    const chevrons = container.querySelectorAll("svg.lucide-chevron-right");
    const openButtons = container.querySelectorAll('button[aria-label$="の詳細を開く"]');
    expect(openButtons.length).toBe(1);
    expect(openButtons[0]?.getAttribute("aria-label")).toContain("コミュニティ会員");
    expect(chevrons.length).toBe(1);
    expect(container.textContent).toContain("現在のプラン");
    expect(container.textContent).toContain("manage footer");
  });

  it("コミュニティカードを開くと申し込むリンクが新しいタブで開く", async () => {
    await act(async () => {
      root.render(
        <PlanCards
          generalDialog={<p>g</p>}
          communityDialog={
            <div>
              <p>案内</p>
              <CommunityApplyButton />
            </div>
          }
        />
      );
    });

    const communityDetail = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("コミュニティ会員")
    );
    expect(communityDetail).toBeTruthy();

    await act(async () => {
      communityDetail?.click();
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog).toBeTruthy();
    const applyLink = dialog?.querySelector(`a[href="${COMMUNITY_APPLY_FORM_URL}"]`);
    expect(applyLink).toBeTruthy();
    expect(applyLink?.getAttribute("target")).toBe("_blank");
    expect(applyLink?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(applyLink?.textContent).toContain("申し込む");
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
