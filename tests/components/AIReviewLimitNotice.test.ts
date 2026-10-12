import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { AIReviewLimitNotice } from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/AIReviewLimitNotice";
import { trialLimitMessage } from "@/app/lib/ai-review-limits";

const render = (props: Parameters<typeof AIReviewLimitNotice>[0]) =>
  renderToStaticMarkup(createElement(AIReviewLimitNotice, props));

describe("AIReviewLimitNotice", () => {
  it("active: サーバーで算出した残り回数を表示する", () => {
    const html = render({ userStatus: "active", remaining: 1, stripeEnabled: true });
    expect(html).toContain("本日の残り回数: 1回（この課題）");
    expect(html).not.toContain("/upgrade");
  });

  it("active: 回数の取得に失敗したときは残り回数を出さない", () => {
    const html = render({ userStatus: "active", remaining: null, stripeEnabled: true });
    expect(html).not.toContain("本日の残り回数");
  });

  it("trial + Stripe有効: API と同じ文言とアップグレード導線を表示する", () => {
    const html = render({ userStatus: "trial", remaining: 1, stripeEnabled: true });
    expect(html).toContain(trialLimitMessage());
    expect(html).toContain("有料会員は 1 日 2 回まで再レビューできます");
    expect(html).toContain('href="/upgrade"');
  });

  it("trial + Stripe無効: /upgrade への導線を出さず承認の案内のみ表示する", () => {
    const html = render({ userStatus: "trial", remaining: 0, stripeEnabled: false });
    expect(html).toContain(trialLimitMessage());
    expect(html).not.toContain("/upgrade");
    expect(html).toContain("本登録は運営の承認で行います");
  });
});
