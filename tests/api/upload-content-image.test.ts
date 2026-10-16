import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/upload-content-image/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

const createMockSupabase = ({
  content = { id: 12 },
  contentError = null,
  uploadError = null,
}: {
  content?: { id: number } | null;
  contentError?: unknown;
  uploadError?: unknown;
} = {}) => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: content, error: contentError }),
  };
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const storage = {
    from: vi.fn().mockReturnValue({ upload }),
  };
  return { client: { from: vi.fn().mockReturnValue(query), storage }, query, upload };
};

const request = (file: File | null, contentId = "12") => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (contentId !== "") formData.append("contentId", contentId);
  return new Request("http://localhost/api/upload-content-image", {
    method: "POST",
    body: formData,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(createMockSupabase().client as never);
  vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-2222-3333-4444-555555555555");
});

describe("POST /api/upload-content-image", () => {
  it("未認証は401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request(new File(["x"], "a.png", { type: "image/png" })) as never);

    expect(res.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("member は403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...maintainerAuth,
      userRole: "member",
    } as never);

    const res = await POST(request(new File(["x"], "a.png", { type: "image/png" })) as never);

    expect(res.status).toBe(403);
  });

  it("contentId 無しは400", async () => {
    const res = await POST(request(new File(["x"], "a.png", { type: "image/png" }), "") as never);
    expect(res.status).toBe(400);
  });

  it("許可外 MIME は400", async () => {
    const res = await POST(request(new File(["x"], "a.bmp", { type: "image/bmp" })) as never);
    expect(res.status).toBe(400);
  });

  it("サイズ超過は400", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", {
      type: "image/png",
    });
    const res = await POST(request(big) as never);
    expect(res.status).toBe(400);
  });

  it("コンテンツが無いときは404", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabase({ content: null }).client as never
    );

    const res = await POST(request(new File(["x"], "a.png", { type: "image/png" })) as never);

    expect(res.status).toBe(404);
  });

  it("PNG を content-{id}/uuid.png へ保存しプレースホルダ参照を返す", async () => {
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(
      request(new File(["png"], "diagram.png", { type: "image/png" })) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objectKey).toBe("content-12/11111111-2222-3333-4444-555555555555.png");
    expect(body.path).toBe(
      "{{SUPABASE_STORAGE_URL}}/content-images/content-12/11111111-2222-3333-4444-555555555555.png"
    );
    expect(upload).toHaveBeenCalledWith(
      body.objectKey,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "image/png", upsert: false })
    );
  });
});
