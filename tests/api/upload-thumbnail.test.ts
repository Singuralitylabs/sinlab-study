import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/upload-thumbnail/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

const mockSupabase = (upload = vi.fn().mockResolvedValue({ error: null })) => ({
  storage: {
    from: vi.fn().mockReturnValue({
      upload,
      getPublicUrl: vi.fn().mockReturnValue({
        data: {
          publicUrl:
            "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-12/thumbnail.png",
        },
      }),
    }),
  },
});

const request = (file: File | null, themeId = "12") => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  formData.append("themeId", themeId);
  return new Request("http://localhost/api/upload-thumbnail", { method: "POST", body: formData });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockSupabase() as never);
});

describe("POST /api/upload-thumbnail", () => {
  it("管理者・メンテナーはPNGをテーマIDベースの固定キーへアップロードできる", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1723500000);
    const upload = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockSupabase(upload) as never);

    const response = await POST(
      request(new File(["png"], "thumbnail.png", { type: "image/png" })) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      path: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1723500000",
      url: "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1723500000",
    });
    expect(upload).toHaveBeenCalledWith("theme-12/thumbnail.png", expect.any(Uint8Array), {
      contentType: "image/png",
      upsert: true,
    });
  });

  it.each([
    ["未認証", { user: null, userId: null, userStatus: null, userRole: null }, 401],
    ["却下済み", { ...maintainerAuth, userStatus: "rejected" }, 403],
    ["member", { ...maintainerAuth, userRole: "member" }, 403],
  ])("%sユーザーはアップロードできない", async (_, auth, status) => {
    vi.mocked(getServerAuth).mockResolvedValue(auth as never);

    const response = await POST(
      request(new File(["png"], "thumbnail.png", { type: "image/png" })) as never
    );

    expect(response.status).toBe(status);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    [new File(["gif"], "thumbnail.gif", { type: "image/gif" }), "12", "形式"],
    [
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "thumbnail.png", { type: "image/png" }),
      "12",
      "サイズ",
    ],
    [new File(["png"], "thumbnail.png", { type: "image/png" }), "12/../../x", "テーマID"],
  ])("不正な%sを拒否する", async (file, themeId) => {
    const response = await POST(request(file, themeId) as never);

    expect(response.status).toBe(400);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
