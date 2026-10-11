import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/announcements-server");

import { POST } from "@/app/api/announcements/[id]/read/route";
import {
  fetchVisibleAnnouncement,
  markAnnouncementRead,
  resolveAnnouncementViewer,
} from "@/app/services/api/announcements-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const viewer = { userId: 7, status: "trial" as const, membershipType: null };
const request = () =>
  new NextRequest("https://study.example.com/api/announcements/5/read", { method: "POST" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 7,
    userStatus: "trial",
    userRole: "member",
  } as never);
  vi.mocked(resolveAnnouncementViewer).mockResolvedValue(viewer);
  vi.mocked(fetchVisibleAnnouncement).mockResolvedValue({
    data: {
      id: 5,
      title: "t",
      body: "b",
      published_at: "2026-10-01T00:00:00Z",
      target_statuses: ["trial"],
      target_membership_types: null,
    },
    error: null,
  });
  vi.mocked(markAnnouncementRead).mockResolvedValue({ error: null });
});

describe("POST /api/announcements/[id]/read", () => {
  it("自分に見えるお知らせなら既読を記録する", async () => {
    const res = await POST(request(), params("5"));

    expect(res.status).toBe(200);
    expect(fetchVisibleAnnouncement).toHaveBeenCalledWith(viewer, 5);
    expect(markAnnouncementRead).toHaveBeenCalledWith(7, 5);
  });

  it("自分に見えない（下書き・非対象・削除済み・存在しない）お知らせは 404 で、記録しない", async () => {
    vi.mocked(fetchVisibleAnnouncement).mockResolvedValue({ data: null, error: null });

    const res = await POST(request(), params("5"));

    expect(res.status).toBe(404);
    expect(markAnnouncementRead).not.toHaveBeenCalled();
  });

  it("未認証は 401、却下ユーザーは 403、不正な ID は 400", async () => {
    vi.mocked(getServerAuth).mockResolvedValueOnce({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);
    expect((await POST(request(), params("5"))).status).toBe(401);

    vi.mocked(getServerAuth).mockResolvedValueOnce({
      user: { id: "auth-uuid" },
      userId: 7,
      userStatus: "rejected",
      userRole: "member",
    } as never);
    expect((await POST(request(), params("5"))).status).toBe(403);

    expect((await POST(request(), params("x"))).status).toBe(400);
    expect(markAnnouncementRead).not.toHaveBeenCalled();
  });
});
