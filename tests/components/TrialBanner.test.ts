import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { TrialBanner } from "@/app/(authenticated)/components/TrialBanner";

const render = (pathname: string, stripeEnabled: boolean) => {
  usePathnameMock.mockReturnValue(pathname);
  return renderToStaticMarkup(createElement(TrialBanner, { stripeEnabled }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrialBanner", () => {
  it.each(["/upgrade", "/learn/1/2", "/learn/1/2/3/4"])("%s では何も描画しない", (pathname) => {
    expect(render(pathname, true)).toBe("");
    expect(render(pathname, false)).toBe("");
  });

  it.each(["/", "/learn", "/learn/1", "/upgrade/success"])(
    "%s では Stripe 有効時に文面とアップグレードボタンを描画する",
    (pathname) => {
      const html = render(pathname, true);
      expect(html).toContain("現在は無料プランでご利用中です");
      expect(html).toContain("アップグレードまたは管理者による本登録が必要です");
      expect(html).toContain('href="/upgrade"');
    }
  );

  it("Stripe 無効時は本登録の案内のみで /upgrade への導線を出さない", () => {
    const html = render("/learn", false);
    expect(html).toContain("現在は無料プランでご利用中です");
    expect(html).toContain("管理者による本登録が必要です");
    expect(html).not.toContain("アップグレード");
    expect(html).not.toContain("/upgrade");
  });

  it("遷移で pathname が変われば表示と非表示が切り替わる", () => {
    expect(render("/learn/1", true)).not.toBe("");
    expect(render("/learn/1/2", true)).toBe("");
    expect(render("/learn/1", true)).not.toBe("");
  });
});
