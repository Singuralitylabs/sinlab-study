import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { AIReviewLimitNotice } from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[contentId]/AIReviewLimitNotice";
import { trialLimitMessage } from "@/app/lib/ai-review-limits";

const render = (props: Parameters<typeof AIReviewLimitNotice>[0]) =>
  renderToStaticMarkup(createElement(AIReviewLimitNotice, props));

describe("AIReviewLimitNotice", () => {
  it("active: サーバーで算出した残り回数を表示する", () => {
    const html = render({ userStatus: "active", remaining: 1, stripeEnabled: true });
    expect(html).toContain("本日の残り回数: 1回");
    expect(html).not.toContain("/upgrade");
  });

  it("active: 注記に課題ごとの上限と全課題合計の上限の両方を書く", () => {
    const html = render({ userStatus: "active", remaining: 1, stripeEnabled: true });
    expect(html).toContain("1課題につき1日2回、全課題の合計で1日10回まで");
    expect(html).not.toContain("全課題の合計上限に達しています");
  });

  it("active: 全体上限で残り0のときは理由を出す", () => {
    const html = render({
      userStatus: "active",
      remaining: 0,
      dailyTotalReached: true,
      stripeEnabled: true,
    });
    expect(html).toContain("本日の残り回数: 0回");
    expect(html).toContain("全課題の合計上限に達しています");
  });

  it("active: その課題の上限で残り0のときは全体上限の理由を出さない", () => {
    const html = render({ userStatus: "active", remaining: 0, stripeEnabled: true });
    expect(html).not.toContain("全課題の合計上限に達しています");
  });

  it("active: 回数の取得に失敗したときは残り回数を出さない", () => {
    const html = render({ userStatus: "active", remaining: null, stripeEnabled: true });
    expect(html).not.toContain("本日の残り回数");
  });

  it("trial + Stripe有効: API と同じ文言とアップグレード導線を表示する", () => {
    const html = render({ userStatus: "trial", remaining: 1, stripeEnabled: true });
    expect(html).toContain(trialLimitMessage());
    expect(html).toContain(
      "有料会員は 1課題につき1日2回、全課題の合計で1日10回まで再レビューできます"
    );
    expect(html).toContain('href="/upgrade"');
  });

  it("trial + Stripe無効: /upgrade への導線を出さず承認の案内のみ表示する", () => {
    const html = render({ userStatus: "trial", remaining: 0, stripeEnabled: false });
    expect(html).toContain(trialLimitMessage());
    expect(html).not.toContain("/upgrade");
    expect(html).toContain("本登録は運営の承認で行います");
  });
});
