import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/email-settings-server");

import { GET, PUT } from "@/app/api/admin/email-settings/route";
import {
  fetchEmailSettingsForAdmin,
  updateDigestDailyLimit,
  updateEmailKindSettings,
} from "@/app/services/api/email-settings-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const authAs = (overrides: Record<string, unknown> = {}) =>
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 1,
    userStatus: "active",
    userRole: "admin",
    ...overrides,
  } as never);

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/admin/email-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  authAs();
  vi.mocked(updateEmailKindSettings).mockResolvedValue({ error: null, updated: true });
  vi.mocked(updateDigestDailyLimit).mockResolvedValue({ error: null, updated: true });
  vi.mocked(fetchEmailSettingsForAdmin).mockResolvedValue({
    data: { kinds: {}, editorNames: {} } as never,
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/admin/email-settings - 権限", () => {
  it.each([
    ["GET", () => GET()],
    ["PUT", () => put({ kind: "signup", enabled: false })],
  ])("%s: 未認証は401で、何も読み書きしない", async (_method, call) => {
    authAs({ user: null, userId: null, userStatus: null, userRole: null });

    const res = await call();

    expect(res.status).toBe(401);
    expect(fetchEmailSettingsForAdmin).not.toHaveBeenCalled();
    expect(updateEmailKindSettings).not.toHaveBeenCalled();
  });

  it.each(["maintainer", "member"])("%s は403（maintainer にも開放しない）", async (role) => {
    authAs({ userRole: role });

    expect((await GET()).status).toBe(403);
    expect((await put({ kind: "signup", enabled: false })).status).toBe(403);
    expect(fetchEmailSettingsForAdmin).not.toHaveBeenCalled();
    expect(updateEmailKindSettings).not.toHaveBeenCalled();
    expect(updateDigestDailyLimit).not.toHaveBeenCalled();
  });

  it("却下済みの元 admin は403", async () => {
    authAs({ userStatus: "rejected" });

    expect((await put({ kind: "signup", enabled: false })).status).toBe(403);
    expect(updateEmailKindSettings).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/email-settings", () => {
  it("admin には設定を返す", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ settings: { kinds: {}, editorNames: {} } });
  });

  it("取得に失敗したら500", async () => {
    vi.mocked(fetchEmailSettingsForAdmin).mockResolvedValue({ data: null, error: "失敗" });

    expect((await GET()).status).toBe(500);
  });
});

describe("PUT /api/admin/email-settings", () => {
  it("種別の設定を更新し、更新者（users.id）を渡す。send_days は昇順で保存する", async () => {
    const res = await put({ kind: "trial_nurture", enabled: false, send_days: [14, 2, 7] });

    expect(res.status).toBe(200);
    expect(updateEmailKindSettings).toHaveBeenCalledWith(
      "trial_nurture",
      { enabled: false, send_days: [2, 7, 14] },
      1
    );
  });

  it("週次進捗の曜日を更新する", async () => {
    await put({ kind: "weekly_digest", send_weekday: 6 });

    expect(updateEmailKindSettings).toHaveBeenCalledWith("weekly_digest", { send_weekday: 6 }, 1);
  });

  it("1日の上限を更新する", async () => {
    const res = await put({ digest_daily_limit: 95 });

    expect(res.status).toBe(200);
    expect(updateDigestDailyLimit).toHaveBeenCalledWith(95, 1);
    expect(updateEmailKindSettings).not.toHaveBeenCalled();
  });

  it.each([
    ["digest_daily_limit が 0", { digest_daily_limit: 0 }],
    ["digest_daily_limit が 96", { digest_daily_limit: 96 }],
    ["send_days に 0", { kind: "trial_nurture", send_days: [0, 3] }],
    ["send_days に 61", { kind: "trial_nurture", send_days: [61] }],
    ["send_days が重複", { kind: "trial_nurture", send_days: [3, 3] }],
    ["send_days が空", { kind: "trial_nurture", send_days: [] }],
    [
      "send_days が 11 個",
      { kind: "trial_nurture", send_days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    ],
    ["send_weekday が 7", { kind: "weekly_digest", send_weekday: 7 }],
    ["send_weekday が -1", { kind: "weekly_digest", send_weekday: -1 }],
    ["未知の種別", { kind: "weekly_digest_reserved", enabled: false }],
    ["send_days を持たない種別に send_days", { kind: "signup", send_days: [3] }],
    ["weekly_digest 以外に send_weekday", { kind: "signup", send_weekday: 1 }],
    ["更新項目が無い", { kind: "signup" }],
    ["kind も上限も無い", { enabled: true }],
    ["種別と上限の同時更新", { kind: "signup", enabled: true, digest_daily_limit: 10 }],
    ["未知のフィールド", { kind: "signup", enabled: true, updated_by: 99 }],
    ["enabled が真偽値以外", { kind: "signup", enabled: "false" }],
  ])("範囲外・不正な値は400で、何も保存しない: %s", async (_label, body) => {
    const res = await put(body);

    expect(res.status).toBe(400);
    expect(updateEmailKindSettings).not.toHaveBeenCalled();
    expect(updateDigestDailyLimit).not.toHaveBeenCalled();
  });

  it.each([
    [{ digest_daily_limit: 1 }],
    [{ digest_daily_limit: 95 }],
    [{ kind: "trial_nurture", send_days: [1] }],
    [{ kind: "trial_nurture", send_days: [60] }],
    [{ kind: "inactivity_reminder", send_days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
    [{ kind: "weekly_digest", send_weekday: 0 }],
    [{ kind: "weekly_digest", send_weekday: 6 }],
    [{ kind: "announcement", enabled: false }],
  ])("境界値は受け付ける: %j", async (body) => {
    expect((await put(body)).status).toBe(200);
  });

  it("JSON でないボディは400", async () => {
    const res = await PUT(
      new Request("http://localhost/api/admin/email-settings", { method: "PUT", body: "x" })
    );

    expect(res.status).toBe(400);
  });

  it("更新対象が0行（行が無い・RLSで拒否）なら404", async () => {
    vi.mocked(updateEmailKindSettings).mockResolvedValue({ error: null, updated: false });

    expect((await put({ kind: "signup", enabled: false })).status).toBe(404);
  });

  it("更新に失敗したら500", async () => {
    vi.mocked(updateDigestDailyLimit).mockResolvedValue({
      error: { message: "db" } as never,
      updated: false,
    });

    expect((await put({ digest_daily_limit: 50 })).status).toBe(500);
  });
});
