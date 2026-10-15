import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import {
  fetchUserDisplayName,
  updateUserDisplayName,
} from "@/app/services/api/user-profile-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateUserDisplayName", () => {
  const clientReturning = (data: unknown, error: unknown = null) => {
    const mockClient = createMockSupabaseClient({ tableResults: { users: { data, error } } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    return mockClient;
  };

  it("本人の行の display_name だけを service_role で更新する", async () => {
    const mockClient = clientReturning({ display_name: "山田 太郎" });

    const result = await updateUserDisplayName(3, "山田 太郎");

    expect(result).toEqual({ data: "山田 太郎", error: null });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("users");
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith({ display_name: "山田 太郎" });
    expect(builder.update.mock.calls[0][0]).not.toHaveProperty("role");
    expect(builder.update.mock.calls[0][0]).not.toHaveProperty("status");
    expect(builder.eq).toHaveBeenCalledWith("id", 3);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(builder.select).toHaveBeenCalledWith("display_name");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("対象が0行なら data: null、DBエラーなら error を返す", async () => {
    clientReturning(null);
    expect(await updateUserDisplayName(3, "山田")).toEqual({ data: null, error: null });

    vi.spyOn(console, "error").mockImplementation(() => {});
    clientReturning(null, dbError);
    expect(await updateUserDisplayName(3, "山田")).toEqual({ data: null, error: dbError });
  });
});

describe("fetchUserDisplayName", () => {
  const clientReturning = (data: unknown, error: unknown = null) => {
    const mockClient = createMockSupabaseClient({ tableResults: { users: { data, error } } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);
    return mockClient;
  };

  it("本人の行の display_name を通常クライアントで返す", async () => {
    const mockClient = clientReturning({ display_name: "山田" });

    expect(await fetchUserDisplayName(3)).toEqual({ data: "山田", error: null });
    expect(mockClient.from.mock.results[0].value.eq).toHaveBeenCalledWith("id", 3);
    expect(mockClient.from.mock.results[0].value.select).toHaveBeenCalledWith("display_name");
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("行が無い、または DB エラーなら data: null を返す", async () => {
    clientReturning(null);
    expect(await fetchUserDisplayName(3)).toEqual({ data: null, error: null });

    vi.spyOn(console, "error").mockImplementation(() => {});
    clientReturning(null, dbError);
    expect(await fetchUserDisplayName(3)).toEqual({ data: null, error: dbError });
  });
});
