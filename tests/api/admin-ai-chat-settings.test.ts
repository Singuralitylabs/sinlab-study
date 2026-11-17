import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/ai-chat-server");

import { GET, PUT } from "@/app/api/admin/ai-chat-settings/route";
import { AI_CHAT_LIMIT_BOUNDS } from "@/app/constants/ai-chat";
import { fetchAIChatSettingsForAdmin, updateAIChatLimits } from "@/app/services/api/ai-chat-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const adminAuth = {
  user: { id: "auth-uuid-admin" },
  userId: 1,
  userStatus: "active",
  userRole: "admin",
};

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/admin/ai-chat-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getServerAuth).mockResolvedValue(adminAuth as never);
  vi.mocked(updateAIChatLimits).mockResolvedValue({ error: null, updated: true });
  vi.mocked(fetchAIChatSettingsForAdmin).mockResolvedValue({
    data: {
      limits: { activePerDay: 20, trialLifetime: 5 },
      updatedAt: null,
      updatedByName: null,
      usingDefaults: false,
    },
    error: null,
  });
});

describe("/api/admin/ai-chat-settings", () => {
  it.each(["maintainer", "member"])("%s は 403", async (userRole) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...adminAuth, userRole } as never);
    expect((await GET()).status).toBe(403);
    expect((await put({ activePerDay: 10, trialLifetime: 3 })).status).toBe(403);
    expect(updateAIChatLimits).not.toHaveBeenCalled();
  });

  it("admin は保存でき、操作した admin を記録する", async () => {
    const res = await put({ activePerDay: 10, trialLifetime: 3 });
    expect(res.status).toBe(200);
    expect(updateAIChatLimits).toHaveBeenCalledWith({ activePerDay: 10, trialLifetime: 3 }, 1);
  });

  it.each([
    { activePerDay: AI_CHAT_LIMIT_BOUNDS.activePerDay.max + 1, trialLifetime: 3 },
    { activePerDay: 10, trialLifetime: 0 },
    { activePerDay: 1.5, trialLifetime: 3 },
    { activePerDay: 10, trialLifetime: 3, extra: 1 },
  ])("範囲外・不正な値は 400: %j", async (body) => {
    expect((await put(body)).status).toBe(400);
    expect(updateAIChatLimits).not.toHaveBeenCalled();
  });

  it("GET は現在の設定を返す", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).settings.limits).toEqual({ activePerDay: 20, trialLifetime: 5 });
  });
});
