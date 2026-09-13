import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/supabase-server");

import { SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS, SLIDES_BUCKET } from "@/app/constants/storage";
import {
  createSlideSignedUrl,
  createSlideSignedUrlWithClient,
} from "@/app/services/api/slides-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const mockStorage = (result: { data: { signedUrl: string } | null; error: unknown }) => {
  const createSignedUrl = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ createSignedUrl });
  return { client: { storage: { from } }, from, createSignedUrl };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createSlideSignedUrlWithClient", () => {
  it("オブジェクトキーで slides バケットの署名付きURLを発行する", async () => {
    const { client, from, createSignedUrl } = mockStorage({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/slides/x?token=t" },
      error: null,
    });

    await expect(createSlideSignedUrlWithClient(client as never, "gas/slide-01.pdf")).resolves.toBe(
      "https://project.supabase.co/storage/v1/object/sign/slides/x?token=t"
    );
    expect(from).toHaveBeenCalledWith(SLIDES_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "gas/slide-01.pdf",
      SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });

  it("旧形式の公開URLはキーへ正規化してから署名する", async () => {
    const { client, createSignedUrl } = mockStorage({
      data: { signedUrl: "https://signed" },
      error: null,
    });

    await createSlideSignedUrlWithClient(
      client as never,
      "https://project.supabase.co/storage/v1/object/public/slides/gas/slide-02.pdf"
    );

    expect(createSignedUrl).toHaveBeenCalledWith(
      "gas/slide-02.pdf",
      SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });

  it("キーとして解釈できない値では Storage を呼ばず null を返す", async () => {
    const { client, createSignedUrl } = mockStorage({
      data: { signedUrl: "https://signed" },
      error: null,
    });

    await expect(
      createSlideSignedUrlWithClient(client as never, "https://example.com/slide.pdf")
    ).resolves.toBeNull();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("Storage がエラーを返した場合は null を返す（RLSで不可視の場合を含む）", async () => {
    const { client } = mockStorage({ data: null, error: { message: "Object not found" } });

    await expect(
      createSlideSignedUrlWithClient(client as never, "gas/slide-01.pdf")
    ).resolves.toBeNull();
  });

  it("エラー無しで signedUrl が空の場合も null を返す", async () => {
    const { client } = mockStorage({ data: null, error: null });

    await expect(
      createSlideSignedUrlWithClient(client as never, "gas/slide-01.pdf")
    ).resolves.toBeNull();
  });
});

describe("createSlideSignedUrl", () => {
  it("通常クライアント（RLS適用）で署名し、service_role は使わない", async () => {
    const { client, createSignedUrl } = mockStorage({
      data: { signedUrl: "https://signed" },
      error: null,
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    await expect(createSlideSignedUrl("gas/slide-01.pdf")).resolves.toBe("https://signed");
    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(createSignedUrl).toHaveBeenCalledWith(
      "gas/slide-01.pdf",
      SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });
});
