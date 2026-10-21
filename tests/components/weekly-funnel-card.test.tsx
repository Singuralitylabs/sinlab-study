/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/manage",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("isActivationCohortOpen", () => {
  it("週末登録の7日が残る今週と前週だけを未確定にする", () => {
    expect(isActivationCohortOpen("2026-09-14", now)).toBe(false);
    expect(isActivationCohortOpen("2026-09-21", now)).toBe(true);
    expect(isActivationCohortOpen("2026-09-28", now)).toBe(true);
    expect(isActivationCohortOpen("2026-09-21", new Date("2026-10-04T15:00:00.000Z"))).toBe(false);
  });
});

describe("WeeklyFunnelCard", () => {
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

  it("折りたたみ内に〜数の列名と未確定表示を出す", async () => {
    await act(async () => {
      root.render(<WeeklyFunnelCard rows={rows} errorMessage={null} weeks={8} now={now} />);
    });

    const html = container.innerHTML;
    expect(html).toContain("週次ファネル");
    expect(html).toContain("<details");
    expect(html).toContain("登録数");
    expect(html).toContain("初回提出数");
    expect(html).toContain("有料化数");
    expect(html).toContain("解約数");
    expect(html).toContain("有料会員数");
    expect(html).toContain("2026/09/14");
    expect(html).not.toContain(">有効化<");
    expect(html).not.toContain("50%");
    expect([...html.matchAll(/未確定/g)]).toHaveLength(2);
    expect(container.querySelector('[aria-label="初回提出数の説明"]')).not.toBeNull();
  });

  it("取得失敗時は表を出さず文言だけを出す", async () => {
    await act(async () => {
      root.render(
        <WeeklyFunnelCard rows={[]} errorMessage="週次ファネルを取得できませんでした" weeks={8} />
      );
    });

    expect(container.textContent).toContain("週次ファネルを取得できませんでした");
    expect(container.querySelector("table")).toBeNull();
  });
});
