import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOnboardingComplete } from "@/app/(authenticated)/components/WelcomeDialog";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("requestOnboardingComplete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("成功時は完了コールバックを呼ぶ", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const onCompleted = vi.fn();

    requestOnboardingComplete(onCompleted);
    await flush();

    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("送信失敗時は例外を投げず、警告ログを残してコールバックを呼ばない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onCompleted = vi.fn();

    expect(() => requestOnboardingComplete(onCompleted)).not.toThrow();
    await flush();

    expect(warn).toHaveBeenCalledOnce();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("応答が ok でないときは警告ログを残してコールバックを呼ばない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onCompleted = vi.fn();

    requestOnboardingComplete(onCompleted);
    await flush();

    expect(warn).toHaveBeenCalledOnce();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
