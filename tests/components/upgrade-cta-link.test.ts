import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";
import { trackUpgradeCtaClicked } from "@/app/components/UpgradeCtaLink";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trackUpgradeCtaClicked", () => {
  it.each(["lock_screen", "phase_list", "dashboard_card", "banner"] as const)(
    "source=%s だけを送る",
    (source) => {
      trackUpgradeCtaClicked(source);
      expect(track).toHaveBeenCalledWith("upgrade_cta_clicked", { source });
      expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("@");
    }
  );

  it("track が投げてもクリック処理は例外にしない", () => {
    vi.mocked(track).mockImplementationOnce(() => {
      throw new Error("analytics down");
    });
    expect(() => trackUpgradeCtaClicked("banner")).not.toThrow();
  });
});
