import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/ai-review-settings-server");

import { GET, PUT } from "@/app/api/admin/ai-review-settings/route";
import {
  fetchAIReviewSettingsForAdmin,
  updateAIReviewLimits,
} from "@/app/services/api/ai-review-settings-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const adminAuth = {
  user: { id: "auth-uuid-admin" },
  userId: 1,
  userStatus: "active",
  userRole: "admin",
};

const valid = { activePerContentPerDay: 3, activePerDay: 20, trialPerContentLifetime: 2 };

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/admin/ai-review-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getServerAuth).mockResolvedValue(adminAuth as never);
  vi.mocked(updateAIReviewLimits).mockResolvedValue({ error: null, updated: true });
  vi.mocked(fetchAIReviewSettingsForAdmin).mockResolvedValue({
    data: {
      limits: { active: { perContentPerDay: 2, perDay: 10 }, trial: { perContentLifetime: 1 } },
      updatedAt: null,
      updatedByName: null,
      usingDefaults: false,
    },
    error: null,
  });
});

describe("/api/admin/ai-review-settings - 認可", () => {
  it.each(["maintainer", "member"])("%s は GET / PUT とも403で何も実行しない", async (userRole) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...adminAuth, userRole } as never);

    expect((await GET()).status).toBe(403);
    expect((await put(valid)).status).toBe(403);
    expect(updateAIReviewLimits).not.toHaveBeenCalled();
  });

  it("未認証は401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    expect((await put(valid)).status).toBe(401);
    expect(updateAIReviewLimits).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/ai-review-settings", () => {
  it("現在の設定を返す", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      settings: { limits: { active: { perDay: 10 } } },
    });
  });

  it("取得に失敗したら500", async () => {
    vi.mocked(fetchAIReviewSettingsForAdmin).mockResolvedValue({ data: null, error: "x" });

    expect((await GET()).status).toBe(500);
  });
});

describe("PUT /api/admin/ai-review-settings", () => {
  it("検証済みの値と操作した管理者を渡して更新する", async () => {
    const res = await put(valid);

    expect(res.status).toBe(200);
    expect(updateAIReviewLimits).toHaveBeenCalledWith(
      { active: { perContentPerDay: 3, perDay: 20 }, trial: { perContentLifetime: 2 } },
      1
    );
  });

  it.each([
    ["範囲外（課題ごと）", { ...valid, activePerContentPerDay: 21 }],
    ["範囲外（0回）", { ...valid, trialPerContentLifetime: 0 }],
    ["小数", { ...valid, activePerDay: 10.5 }],
    ["全課題合計が課題ごとより小さい", { ...valid, activePerContentPerDay: 5, activePerDay: 4 }],
    ["項目不足", { activePerDay: 10 }],
    ["余分な項目", { ...valid, extra: 1 }],
    ["文字列", { ...valid, activePerDay: "10" }],
  ])("%s は400で更新しない", async (_label, body) => {
    const res = await put(body);

    expect(res.status).toBe(400);
    expect(updateAIReviewLimits).not.toHaveBeenCalled();
  });

  it("0行更新（行なし・RLS拒否）は404", async () => {
    vi.mocked(updateAIReviewLimits).mockResolvedValue({ error: null, updated: false });

    expect((await put(valid)).status).toBe(404);
  });

  it("DBエラーは500", async () => {
    vi.mocked(updateAIReviewLimits).mockResolvedValue({
      error: { message: "x" } as never,
      updated: false,
    });

    expect((await put(valid)).status).toBe(500);
  });
});
