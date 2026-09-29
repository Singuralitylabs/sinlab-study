import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/announcements-server");

import { DELETE, PUT } from "@/app/api/manage/announcements/[id]/route";
import { POST } from "@/app/api/manage/announcements/route";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/app/services/api/announcements-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const body = {
  title: "もくもく会のご案内",
  body: "本文",
  target_statuses: ["active"],
  target_membership_types: ["general"],
  send_email: true,
  is_published: true,
};

function auth(userRole: string | null, overrides: Record<string, unknown> = {}) {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 9,
    userStatus: "active",
    userRole,
    ...overrides,
  } as never);
}

function jsonRequest(method: string, payload: unknown) {
  return new NextRequest("https://study.example.com/api/manage/announcements", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAnnouncement).mockResolvedValue({ data: { id: 1 }, error: null });
  vi.mocked(updateAnnouncement).mockResolvedValue({ error: null, notFound: false });
  vi.mocked(deleteAnnouncement).mockResolvedValue({ error: null, notFound: false });
});

describe("お知らせ管理 API の権限", () => {
  it("未認証は 401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    expect((await POST(jsonRequest("POST", body))).status).toBe(401);
    expect((await PUT(jsonRequest("PUT", body), params("1"))).status).toBe(401);
    expect((await DELETE(jsonRequest("DELETE", {}), params("1"))).status).toBe(401);
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("受講生（member）・却下ユーザーは 403 で、何も変更しない", async () => {
    auth("member");
    expect((await POST(jsonRequest("POST", body))).status).toBe(403);
    expect((await PUT(jsonRequest("PUT", body), params("1"))).status).toBe(403);
    expect((await DELETE(jsonRequest("DELETE", {}), params("1"))).status).toBe(403);

    auth("admin", { userStatus: "rejected" });
    expect((await POST(jsonRequest("POST", body))).status).toBe(403);

    expect(createAnnouncement).not.toHaveBeenCalled();
    expect(updateAnnouncement).not.toHaveBeenCalled();
    expect(deleteAnnouncement).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"])("%s は作成・更新・削除できる", async (role) => {
    auth(role);

    expect((await POST(jsonRequest("POST", body))).status).toBe(200);
    expect(createAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ title: body.title }),
      9
    );
    expect((await PUT(jsonRequest("PUT", body), params("3"))).status).toBe(200);
    expect(updateAnnouncement).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ send_email: true })
    );
    expect((await DELETE(jsonRequest("DELETE", {}), params("3"))).status).toBe(200);
    expect(deleteAnnouncement).toHaveBeenCalledWith(3);
  });
});

describe("お知らせ管理 API の入力検証", () => {
  beforeEach(() => auth("admin"));

  it("不正な入力は 400 で、保存しない", async () => {
    const res = await POST(jsonRequest("POST", { ...body, target_statuses: ["active", "trial"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("お試しユーザーは対象にできません");
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it("不正な ID は 400、存在しない ID は 404", async () => {
    expect((await PUT(jsonRequest("PUT", body), params("abc"))).status).toBe(400);
    expect((await DELETE(jsonRequest("DELETE", {}), params("0"))).status).toBe(400);

    vi.mocked(updateAnnouncement).mockResolvedValue({ error: null, notFound: true });
    vi.mocked(deleteAnnouncement).mockResolvedValue({ error: null, notFound: true });
    expect((await PUT(jsonRequest("PUT", body), params("99"))).status).toBe(404);
    expect((await DELETE(jsonRequest("DELETE", {}), params("99"))).status).toBe(404);
  });

  it("DB エラーは 500", async () => {
    vi.mocked(createAnnouncement).mockResolvedValue({
      data: null,
      error: { message: "db down" } as never,
    });
    expect((await POST(jsonRequest("POST", body))).status).toBe(500);
  });
});
