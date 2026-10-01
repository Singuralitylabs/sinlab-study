import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklyFunnelCard } from "@/app/(authenticated)/manage/components/WeeklyFunnelCard";

const rows = [
  {
    weekStart: "2026-09-21",
    signups: 3,
    activated: 1,
    upgraded: 0,
    ended: 0,
    paidTotal: 4,
  },
  {
    weekStart: "2026-09-28",
    signups: 5,
    activated: 2,
    upgraded: 1,
    ended: 1,
    paidTotal: 6,
  },
];

describe("WeeklyFunnelCard", () => {
  it("週次の件数を表にし、直近週の有効化だけ未確定と出す", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyFunnelCard, { rows, errorMessage: null })
    );

    expect(html).toContain("週次ファネル");
    expect(html).toContain("2026/09/21");
    expect(html).toContain("2026/09/28");
    expect(html.indexOf("2026/09/28")).toBeGreaterThan(html.indexOf("2026/09/21"));
    const provisional = html.match(/<span[^>]*>未確定<\/span>/g) ?? [];
    expect(provisional).toHaveLength(1);
    expect(html.indexOf(provisional[0] ?? "")).toBeGreaterThan(html.indexOf("2026/09/28"));
    expect(html).not.toContain("50%");
    expect(html).not.toContain("10%");
    expect(html).not.toContain("8%");
    expect(html).not.toContain("@");
  });

  it("取得失敗時は表を出さず文言だけを出す", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyFunnelCard, {
        rows: [],
        errorMessage: "週次ファネルを取得できませんでした",
      })
    );

    expect(html).toContain("週次ファネルを取得できませんでした");
    expect(html).not.toContain("<table");
  });
});
