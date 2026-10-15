import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { fetchUserEmailOptOutAt, setUserEmailOptOut } from "@/app/services/api/user-email-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setUserEmailOptOut", () => {
  const clientReturning = (data: unknown, error: unknown = null) => {
    const mockClient = createMockSupabaseClient({ tableResults: { users: { data, error } } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    return mockClient;
  };

  it("停止: 現在時刻を記録し、未停止の行だけを更新する（元の停止日時を上書きしない）", async () => {
    const mockClient = clientReturning([{ id: 3 }]);

    const result = await setUserEmailOptOut(3, true);

    expect(result).toEqual({ error: null, updated: true });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ email_opt_out_at: expect.any(String) });
    expect(builder.eq).toHaveBeenCalledWith("id", 3);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(builder.is).toHaveBeenCalledWith("email_opt_out_at", null);
  });

  it("再開: NULL に戻し、停止中の行だけを更新する", async () => {
    const mockClient = clientReturning([{ id: 3 }]);

    const result = await setUserEmailOptOut(3, false);

    expect(result.updated).toBe(true);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ email_opt_out_at: null });
    expect(builder.not).toHaveBeenCalledWith("email_opt_out_at", "is", null);
  });

  it("対象が0行なら updated: false、DBエラーなら error を返す", async () => {
    clientReturning([]);
    expect(await setUserEmailOptOut(3, true)).toEqual({ error: null, updated: false });

    vi.spyOn(console, "error").mockImplementation(() => {});
    clientReturning(null, dbError);
    expect(await setUserEmailOptOut(3, false)).toEqual({ error: dbError, updated: false });
  });
});

describe("fetchUserEmailOptOutAt", () => {
  const clientReturning = (data: unknown, error: unknown = null) => {
    const mockClient = createMockSupabaseClient({ tableResults: { users: { data, error } } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);
    return mockClient;
  };

  it("本人の行の email_opt_out_at を通常クライアントで返す（NULL は配信中）", async () => {
    const mockClient = clientReturning({ email_opt_out_at: "2026-10-14T00:00:00.000Z" });

    expect(await fetchUserEmailOptOutAt(3)).toEqual({
      data: "2026-10-14T00:00:00.000Z",
      error: null,
    });
    expect(mockClient.from.mock.results[0].value.eq).toHaveBeenCalledWith("id", 3);

    clientReturning({ email_opt_out_at: null });
    expect(await fetchUserEmailOptOutAt(3)).toEqual({ data: null, error: null });
  });

  it("DBエラーなら error を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    clientReturning(null, dbError);

    expect(await fetchUserEmailOptOutAt(3)).toEqual({ data: null, error: dbError });
  });
});
