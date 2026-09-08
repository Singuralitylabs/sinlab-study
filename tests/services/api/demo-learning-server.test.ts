import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

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

const openSlide = {
  content_type: "slide",
  pdf_url: "gas/slide-01.pdf",
  is_published: true,
  is_deleted: false,
  is_open_to_trial: true,
} as const;

describe("createDemoSlideSignedUrl", () => {
  it("公開済み・お試し公開のスライドは service_role クライアントで署名する", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue({ storage: { from } } as never);

    await expect(createDemoSlideSignedUrl(openSlide)).resolves.toBe("https://signed");
    expect(createAdminSupabaseClient).toHaveBeenCalledTimes(1);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(SLIDES_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "gas/slide-01.pdf",
      SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS
    );
  });

  it.each([
    ["お試し非公開", { is_open_to_trial: false }],
    ["未公開", { is_published: false }],
    ["論理削除済み", { is_deleted: true }],
    ["スライド以外の種別", { content_type: "video" }],
    ["pdf_url が無い", { pdf_url: null }],
  ])("%s のコンテンツでは Storage を呼ばず null を返す", async (_label, overrides) => {
    await expect(
      createDemoSlideSignedUrl({ ...openSlide, ...overrides } as never)
    ).resolves.toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("発行に失敗した場合は null を返す", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "x" } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as never);

    await expect(createDemoSlideSignedUrl(openSlide)).resolves.toBeNull();
  });
});

describe("fetchDemoContentsByWeekId", () => {
  it("本文などの重いカラムを取得しないカラム定義で select する", async () => {
    const contents = [{ id: 1, title: "コンテンツ1" }];
    const mockClient = createMockSupabaseClient({ queryResult: { data: contents, error: null } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const { fetchDemoContentsByWeekId } = await import("@/app/services/api/demo-learning-server");
    const result = await fetchDemoContentsByWeekId(10);

    expect(result.data).toEqual(contents);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining("text_content"));
    expect(builder.select).toHaveBeenCalledWith(
      expect.not.stringContaining("exercise_instructions")
    );
  });
});

describe("fetchDemoWeeksWithContentsByPhaseId", () => {
  it("週に紐づくコンテンツの本文などの重いカラムを取得しない", async () => {
    const weeks = [{ id: 1, name: "Week 1", contents: [{ id: 10, title: "コンテンツ10" }] }];
    const mockClient = createMockSupabaseClient({ queryResult: { data: weeks, error: null } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const { fetchDemoWeeksWithContentsByPhaseId } = await import(
      "@/app/services/api/demo-learning-server"
    );
    const result = await fetchDemoWeeksWithContentsByPhaseId(1);

    expect(result.data).toEqual(weeks);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith(expect.not.stringContaining("text_content"));
    expect(builder.select).toHaveBeenCalledWith(
      expect.not.stringContaining("exercise_instructions")
    );
  });
});
