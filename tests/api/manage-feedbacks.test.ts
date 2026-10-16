import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/feedback-server");

import { PATCH } from "@/app/api/manage/feedbacks/[id]/route";
import { updateFeedbackStatus } from "@/app/services/api/feedback-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const managerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/manage/feedbacks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(managerAuth as never);
  vi.mocked(updateFeedbackStatus).mockResolvedValue({
    data: {
      id: 3,
      user_id: 2,
      category: "bug",
      body: "x",
      page_url: null,
      user_agent: null,
      status: "done",
      created_at: "2026-10-16T00:00:00.000Z",
    },
    error: null,
  });
});

describe("PATCH /api/manage/feedbacks/[id]", () => {
  it("member は403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...managerAuth,
      userRole: "member",
    } as never);
    const res = await patch("3", { status: "done" });
    expect(res.status).toBe(403);
    expect(updateFeedbackStatus).not.toHaveBeenCalled();
  });

  it("不正な状態は400", async () => {
    const res = await patch("3", { status: "closed" });
    expect(res.status).toBe(400);
  });

  it("存在しないIDは404", async () => {
    vi.mocked(updateFeedbackStatus).mockResolvedValue({ data: null, error: null });
    const res = await patch("99", { status: "done" });
    expect(res.status).toBe(404);
  });

  it("maintainer は状態を更新できる", async () => {
    const res = await patch("3", { status: "done" });
    expect(res.status).toBe(200);
    expect(updateFeedbackStatus).toHaveBeenCalledWith(3, "done");
  });
});
