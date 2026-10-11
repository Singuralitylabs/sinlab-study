import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

import { track } from "@vercel/analytics/server";
import { ANALYTICS_EVENT } from "@/app/constants/analytics";
import { trackServerEvent } from "@/app/services/analytics/track-server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(track).mockResolvedValue(undefined);
});

describe("trackServerEvent", () => {
  it("プロパティが無ければイベント名だけを送る", () => {
    trackServerEvent(ANALYTICS_EVENT.SIGNUP);
    expect(track).toHaveBeenCalledWith("signup");
  });

  it("個人情報のキーを渡しても track には許可キーだけが届く", () => {
    trackServerEvent(ANALYTICS_EVENT.FIRST_SUBMISSION, {
      status: "active",
      email: "user@example.com",
      user_id: "9",
    });
    expect(track).toHaveBeenCalledWith("first_submission", { status: "active" });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("user@example.com");
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("user_id");
  });

  it("track が拒否しても例外を出さない", async () => {
    vi.mocked(track).mockRejectedValueOnce(new Error("analytics down"));
    expect(() => trackServerEvent(ANALYTICS_EVENT.SUBSCRIPTION_ENDED)).not.toThrow();
    await Promise.resolve();
  });

  it("track が同期的に投げても例外を出さない", () => {
    vi.mocked(track).mockImplementationOnce(() => {
      throw new Error("analytics down");
    });
    expect(() => trackServerEvent(ANALYTICS_EVENT.CHECKOUT_STARTED)).not.toThrow();
  });
});
