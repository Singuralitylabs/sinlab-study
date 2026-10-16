import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/feedback-server");
vi.mock("@/app/services/notifications/slack");

import { POST } from "@/app/api/feedback/route";
import { countRecentFeedbacksForUser, insertFeedback } from "@/app/services/api/feedback-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { sendSlackFeedbackNotification } from "@/app/services/notifications/slack";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEEDBACK_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://study.example.com");
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(countRecentFeedbacksForUser).mockResolvedValue({ count: 0, error: null });
  vi.mocked(insertFeedback).mockResolvedValue({
    data: {
      id: 9,
      user_id: 2,
      category: "bug",
      body: "ボタンが押せない",
      page_url: "https://study.example.com/learn",
      user_agent: "TestAgent",
      status: "open",
      created_at: "2026-10-16T00:00:00.000Z",
    },
    error: null,
  });
  vi.mocked(sendSlackFeedbackNotification).mockResolvedValue(undefined);
});

describe("POST /api/feedback", () => {
  it("機能無効時は503", async () => {
    vi.stubEnv("FEEDBACK_ENABLED", "false");
    const res = await POST(request({ category: "bug", body: "x" }) as never);
    expect(res.status).toBe(503);
    expect(insertFeedback).not.toHaveBeenCalled();
  });

  it("未認証は401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);
    const res = await POST(request({ category: "bug", body: "詳しく書く" }) as never);
    expect(res.status).toBe(401);
  });

  it("rejected は403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);
    const res = await POST(request({ category: "bug", body: "詳しく書く" }) as never);
    expect(res.status).toBe(403);
  });

  it("不正な種別は400", async () => {
    const res = await POST(request({ category: "spam", body: "詳しく書く" }) as never);
    expect(res.status).toBe(400);
  });

  it("空の本文は400", async () => {
    const res = await POST(request({ category: "bug", body: "   " }) as never);
    expect(res.status).toBe(400);
  });

  it("レート制限中は429", async () => {
    vi.mocked(countRecentFeedbacksForUser).mockResolvedValue({ count: 1, error: null });
    const res = await POST(request({ category: "bug", body: "詳しく書く" }) as never);
    expect(res.status).toBe(429);
    expect(insertFeedback).not.toHaveBeenCalled();
  });

  it("保存成功時は200でSlackを呼び、Slack の成否を待たない", async () => {
    const res = await POST(
      request({
        category: "bug",
        body: "ボタンが押せない",
        pageUrl: "https://study.example.com/learn",
        userAgent: "TestAgent",
      }) as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 9 });
    expect(insertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, category: "bug" })
    );
    expect(sendSlackFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackId: 9,
        manageUrl: "https://study.example.com/manage/feedbacks/9",
      })
    );
  });

  it("Slack 通知が reject しても API は200のまま", async () => {
    vi.mocked(sendSlackFeedbackNotification).mockImplementation(
      () => Promise.reject(new Error("slack down")) as Promise<void>
    );
    const res = await POST(request({ category: "bug", body: "詳しく書く" }) as never);
    expect(res.status).toBe(200);
    // Drain the rejected fire-and-forget so Vitest does not treat it as unhandled.
    await Promise.resolve();
  });
});
