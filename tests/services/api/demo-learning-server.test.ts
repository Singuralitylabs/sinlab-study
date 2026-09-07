import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/supabase-server");

import { SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS, SLIDES_BUCKET } from "@/app/constants/storage";
import { createDemoSlideSignedUrl } from "@/app/services/api/demo-learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDemoSlideSignedUrl", () => {
  it("未認証のデモ向けに service_role クライアントで署名する", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue({ storage: { from } } as never);

    await expect(createDemoSlideSignedUrl("gas/slide-01.pdf")).resolves.toBe("https://signed");
    expect(createAdminSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(SLIDES_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "gas/slide-01.pdf",
      SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });

  it("発行に失敗した場合は null を返す", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "x" } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as never);

    await expect(createDemoSlideSignedUrl("gas/slide-01.pdf")).resolves.toBeNull();
  });
});
