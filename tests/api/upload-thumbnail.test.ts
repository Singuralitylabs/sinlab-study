import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { DELETE, POST } from "@/app/api/upload-thumbnail/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

interface MockSupabaseOptions {
  imageUrl?: string | null;
  theme?: { image_url: string | null } | null;
  themeError?: unknown;
  updateError?: unknown;
  uploadError?: unknown;
  removeError?: unknown;
}

const createMockSupabase = ({
  imageUrl = null,
  theme = { image_url: imageUrl },
  themeError = null,
  updateError = null,
  uploadError = null,
  removeError = null,
}: MockSupabaseOptions = {}) => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: theme, error: themeError }),
    // biome-ignore lint/suspicious/noThenProperty: Supabaseクエリビルダーのthenableを再現するため
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: updateError }).then(resolve),
  };
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const remove = vi.fn().mockResolvedValue({ error: removeError });
  const storage = {
    from: vi.fn().mockReturnValue({
      upload,
      remove,
      getPublicUrl: vi.fn().mockReturnValue({
        data: {
          publicUrl:
            "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-12/thumbnail.png",
        },
      }),
    }),
  };
  return { client: { from: vi.fn().mockReturnValue(query), storage }, query, upload, remove };
};

const request = (file: File | null, themeId = "12") => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  formData.append("themeId", themeId);
  return new Request("http://localhost/api/upload-thumbnail", { method: "POST", body: formData });
};

// tests/setup.ts が張る console.error のスパイまで戻さないよう、Date.now のスパイのみ局所的に復元する
let nowSpy: ReturnType<typeof vi.spyOn> | undefined;

const freezeNow = (value: number) => {
  nowSpy = vi.spyOn(Date, "now").mockReturnValue(value);
};

beforeEach(() => {
  // createAdminSupabaseClient の呼び出し回数を検証するケースがあるため履歴はクリアする
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(createMockSupabase().client as never);
});

afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = undefined;
});

describe("POST /api/upload-thumbnail", () => {
  it("テーマの存在確認後、PNGを固定キーへ保存してDB参照も即時更新する", async () => {
    freezeNow(1723500000);
    const { client, query, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(
      request(new File(["png"], "thumbnail.png", { type: "image/png" })) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      path: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1723500000",
      url: "https://project.supabase.co/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1723500000",
    });
    expect(query.select).toHaveBeenCalledWith("image_url");
    expect(upload).toHaveBeenCalledWith("theme-12/thumbnail.png", expect.any(Uint8Array), {
      contentType: "image/png",
      upsert: true,
    });
    expect(query.update).toHaveBeenCalledWith({
      image_url: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1723500000",
    });
  });

  it("拡張子が変わった場合はDB更新後に旧Storageオブジェクトを削除する", async () => {
    const { client, remove } = createMockSupabase({
      imageUrl: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(
      request(new File(["jpg"], "thumbnail.jpg", { type: "image/jpeg" })) as never
    );

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(["theme-12/thumbnail.png"]);
  });

  it("存在しないテーマにはStorageオブジェクトを作成しない", async () => {
    const { client, upload } = createMockSupabase({ theme: null });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(
      request(new File(["png"], "thumbnail.png", { type: "image/png" })) as never
    );

    expect(response.status).toBe(404);
    expect(upload).not.toHaveBeenCalled();
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

describe("DELETE /api/upload-thumbnail", () => {
  it("DB参照を消してから対応するStorageオブジェクトを削除する", async () => {
    const { client, query, remove } = createMockSupabase({
      imageUrl: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1",
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/upload-thumbnail?themeId=12")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, storageRemoved: true });
    expect(query.update).toHaveBeenCalledWith({ image_url: null });
    expect(remove).toHaveBeenCalledWith(["theme-12/thumbnail.png"]);
  });

  it("Storage削除に失敗しても200を返すが、部分失敗を storageRemoved で伝える", async () => {
    const { client, query } = createMockSupabase({
      imageUrl: "/storage/v1/object/public/thumbnails/theme-12/thumbnail.png?v=1",
      removeError: { message: "storage unavailable" },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/upload-thumbnail?themeId=12")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, storageRemoved: false });
    expect(query.update).toHaveBeenCalledWith({ image_url: null });
  });
});
