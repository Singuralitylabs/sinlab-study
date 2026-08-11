import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");
vi.mock("@/app/services/api/supabase-server");

import { PATCH } from "@/app/api/admin/users/route";
import { approveUser, rejectUser } from "@/app/services/api/admin-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const adminAuth = {
  user: { id: "auth-uuid-admin" },
  userId: 1,
  userStatus: "active",
  userRole: "admin",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(adminAuth as never);
  vi.mocked(approveUser).mockResolvedValue({ error: null });
  vi.mocked(rejectUser).mockResolvedValue({ error: null });
  // 承認前チェックで参照する対象ユーザーは承認待ちを既定とする
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(
    createMockSupabaseClient({
      tableResults: { users: { data: { status: "pending" }, error: null } },
    }) as never
  );
});

describe("PATCH /api/admin/users - approve", () => {
  it("membershipType を指定すると承認され、種別が approveUser に渡る", async () => {
    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "general" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, action: "approve" });
    expect(approveUser).toHaveBeenCalledWith(5, "general");
  });

  it("membershipType 未指定の場合は400で、承認処理を呼ばない", async () => {
    const res = await PATCH(request({ userId: 5, action: "approve" }));

    expect(res.status).toBe(400);
    expect(approveUser).not.toHaveBeenCalled();
  });

  it("membershipType が許可値以外の場合は400で、承認処理を呼ばない", async () => {
    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "premium" }));

    expect(res.status).toBe(400);
    expect(approveUser).not.toHaveBeenCalled();
  });

  it("既に承認済みのユーザーは409で、承認処理を呼ばない（会員種別の意図しない上書き防止）", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: { users: { data: { status: "active" }, error: null } },
      }) as never
    );

    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "community" }));

    expect(res.status).toBe(409);
    expect(approveUser).not.toHaveBeenCalled();
  });

  it("却下済みユーザーの再承認（承認し直し）は許可される", async () => {
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: { users: { data: { status: "rejected" }, error: null } },
      }) as never
    );

    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "general" }));

    expect(res.status).toBe(200);
    expect(approveUser).toHaveBeenCalledWith(5, "general");
  });

  it("承認処理が失敗した場合は500を返す", async () => {
    vi.mocked(approveUser).mockResolvedValue({
      error: { message: "db error", code: "PGRST204" } as never,
    });

    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "community" }));

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/admin/users - reject", () => {
  it("membershipType なしでも却下できる", async () => {
    const res = await PATCH(request({ userId: 5, action: "reject" }));

    expect(res.status).toBe(200);
    expect(rejectUser).toHaveBeenCalledWith(5);
    expect(approveUser).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/users - 認可", () => {
  it("admin 以外は403で、承認処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...adminAuth, userRole: "maintainer" } as never);

    const res = await PATCH(request({ userId: 5, action: "approve", membershipType: "community" }));

    expect(res.status).toBe(403);
    expect(approveUser).not.toHaveBeenCalled();
  });
});
