import { describe, expect, it } from "vitest";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/app/services/api/push-subscriptions-server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const input = {
  endpoint: "https://push.example/device",
  keys: { p256dh: "p256", auth: "authkey" },
};

describe("savePushSubscription / deletePushSubscription", () => {
  it("他人の endpoint は上書きしない", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_subscriptions: [{ data: { id: 1, user_id: 9 }, error: null }],
      },
    });

    await expect(savePushSubscription(supabase as never, 2, input, null)).resolves.toBe("conflict");
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("削除条件は endpoint と本人の user_id", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_subscriptions: [{ data: null, error: null }],
      },
    });

    await expect(deletePushSubscription(supabase as never, 2, input.endpoint)).resolves.toBe(
      "deleted"
    );
    const builder = supabase.from.mock.results[0]?.value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(builder.eq.mock.calls).toEqual([
      ["endpoint", input.endpoint],
      ["user_id", 2],
    ]);
  });
});
