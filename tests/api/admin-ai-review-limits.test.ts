import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/ai-review-server");

import { POST } from "@/app/api/admin/ai-review-limits/route";
import { reopenAIReview, resetAIReviewLimits } from "@/app/services/api/ai-review-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const adminAuth = {
  user: { id: "auth-uuid-admin" },
  userId: 1,
  userStatus: "active",
  userRole: "admin",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/ai-review-limits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getServerAuth).mockResolvedValue(adminAuth as never);
  vi.mocked(resetAIReviewLimits).mockResolvedValue({ affected: 2 });
  vi.mocked(reopenAIReview).mockResolvedValue({ reopened: true });
});

describe("POST /api/admin/ai-review-limits - 認可", () => {
  it("未認証は401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request({ action: "reset", userId: 2 }));

    expect(res.status).toBe(401);
    expect(resetAIReviewLimits).not.toHaveBeenCalled();
  });

  it.each(["maintainer", "member"])("%s は403で、何も実行しない", async (userRole) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...adminAuth, userRole } as never);

    const res = await POST(request({ action: "reset", userId: 2 }));

    expect(res.status).toBe(403);
    expect(resetAIReviewLimits).not.toHaveBeenCalled();
    expect(reopenAIReview).not.toHaveBeenCalled();
  });

  it("却下された元管理者は403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...adminAuth, userStatus: "rejected" } as never);

    const res = await POST(request({ action: "reopen", submissionId: 3 }));

    expect(res.status).toBe(403);
    expect(reopenAIReview).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/ai-review-limits - reset", () => {
  it("課題指定なしで全課題をリセットし、操作した管理者を渡す", async () => {
    const res = await POST(request({ action: "reset", userId: 2 }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, affected: 2 });
    expect(resetAIReviewLimits).toHaveBeenCalledWith({
      userId: 2,
      contentId: null,
      performedBy: 1,
    });
  });

  it("contentId を渡すとその課題だけが対象", async () => {
    await POST(request({ action: "reset", userId: 2, contentId: 5 }));

    expect(resetAIReviewLimits).toHaveBeenCalledWith({
      userId: 2,
      contentId: 5,
      performedBy: 1,
    });
  });

  it.each([
    { action: "reset" },
    { action: "reset", userId: "2" },
    { action: "reset", userId: 2, contentId: 0 },
    { action: "unknown", userId: 2 },
  ])("不正な入力 %j は400", async (body) => {
    const res = await POST(request(body));

    expect(res.status).toBe(400);
    expect(resetAIReviewLimits).not.toHaveBeenCalled();
  });

  it("対象が存在しなければ404、DBエラーは500", async () => {
    vi.mocked(resetAIReviewLimits).mockResolvedValueOnce({ notFound: true });
    expect((await POST(request({ action: "reset", userId: 99 }))).status).toBe(404);

    vi.mocked(resetAIReviewLimits).mockResolvedValueOnce(null);
    expect((await POST(request({ action: "reset", userId: 2 }))).status).toBe(500);
  });
});

describe("POST /api/admin/ai-review-limits - reopen", () => {
  it("完了済みレビューの再レビューを許可する", async () => {
    const res = await POST(request({ action: "reopen", submissionId: 7 }));

    expect(res.status).toBe(200);
    expect(reopenAIReview).toHaveBeenCalledWith({ submissionId: 7, performedBy: 1 });
  });

  it("完了済みレビューがなければ409、DBエラーは500", async () => {
    vi.mocked(reopenAIReview).mockResolvedValueOnce({ reopened: false });
    expect((await POST(request({ action: "reopen", submissionId: 7 }))).status).toBe(409);

    vi.mocked(reopenAIReview).mockResolvedValueOnce(null);
    expect((await POST(request({ action: "reopen", submissionId: 7 }))).status).toBe(500);
  });
});
