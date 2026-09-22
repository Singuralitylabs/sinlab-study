import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOnboardingComplete } from "@/app/(authenticated)/components/WelcomeDialog";

describe("requestOnboardingComplete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /api/onboarding/complete を keepalive 付きで送る", () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);

    requestOnboardingComplete();

    expect(fetch).toHaveBeenCalledWith("/api/onboarding/complete", {
      method: "POST",
      keepalive: true,
    });
  });

  it("送信失敗時は例外を投げない（ユーザー操作をブロックしない）", () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetch);

    expect(() => requestOnboardingComplete()).not.toThrow();
  });
});
