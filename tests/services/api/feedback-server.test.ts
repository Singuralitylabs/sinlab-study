import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { fetchManageFeedbackById, fetchManageFeedbacks } from "@/app/services/api/feedback-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchManageFeedbacks", () => {
  it("users.email を select しない (#414)", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: [], error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchManageFeedbacks();

    const selectArg = mockClient.from.mock.results[0]?.value.select.mock.calls[0][0] as string;
    expect(selectArg).toContain("user:users(display_name)");
    expect(selectArg).not.toMatch(/user:users\([^)]*email/);
  });
});

describe("fetchManageFeedbackById", () => {
  it("users.email を select しない (#414)", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchManageFeedbackById(1);

    const selectArg = mockClient.from.mock.results[0]?.value.select.mock.calls[0][0] as string;
    expect(selectArg).toContain("user:users(display_name)");
    expect(selectArg).not.toMatch(/user:users\([^)]*email/);
  });
});
