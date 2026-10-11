import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklyFunnelCard } from "@/app/(authenticated)/manage/components/WeeklyFunnelCard";
import { isActivationCohortOpen } from "@/app/lib/weekly-funnel";

const rows = [
  {
    weekStart: "2026-09-14",
    signups: 2,
    activated: 1,
    upgraded: 0,
    ended: 0,
    paidTotal: 3,
  },
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

// Thursday 2026-10-01 12:00 JST. The 09-14 cohort closed on 09-28 00:00 JST.
// 09-21 stays open until 10-05, and 09-28 until 10-12.
const now = new Date("2026-10-01T03:00:00.000Z");

describe("isActivationCohortOpen", () => {
  it("週末登録の7日が残る今週と前週だけを未確定にする", () => {
    expect(isActivationCohortOpen("2026-09-14", now)).toBe(false);
    expect(isActivationCohortOpen("2026-09-21", now)).toBe(true);
    expect(isActivationCohortOpen("2026-09-28", now)).toBe(true);
    expect(isActivationCohortOpen("2026-09-21", new Date("2026-10-04T15:00:00.000Z"))).toBe(false);
  });
});

describe("WeeklyFunnelCard", () => {
  it("週次の件数を表にし、コホートが閉じる前の週だけ未確定と出す", () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyFunnelCard, { rows, errorMessage: null, now })
    );

    expect(html).toContain("週次ファネル");
    expect(html).toContain("2026/09/14");
    expect(html).toContain("2026/09/21");
    expect(html).toContain("2026/09/28");
    expect(html.indexOf("2026/09/28")).toBeGreaterThan(html.indexOf("2026/09/21"));
    const provisional = [...html.matchAll(/<span[^>]*>未確定<\/span>/g)].map(
      (match) => match.index ?? -1
    );
    expect(provisional).toHaveLength(2);
    expect(provisional[0] ?? -1).toBeGreaterThan(html.indexOf("2026/09/21"));
    expect(provisional[0] ?? -1).toBeLessThan(html.indexOf("2026/09/28"));
    expect(provisional[1] ?? -1).toBeGreaterThan(html.indexOf("2026/09/28"));
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
