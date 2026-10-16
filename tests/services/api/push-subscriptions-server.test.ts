import { describe, expect, it } from "vitest";
import { MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "@/app/constants/notifications";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/app/services/api/push-subscriptions-server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const input = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device",
  keys: { p256dh: "p256", auth: "authkey" },
};

describe("savePushSubscription / deletePushSubscription", () => {
  it("他人の endpoint は呼び出した本人へ付け替える", async () => {
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_subscriptions: [
          { data: { id: 1, user_id: 9 }, error: null },
          { data: [{ id: 1 }], error: null },
          { data: null, error: null },
        ],
      },
    });

    await expect(savePushSubscription(supabase as never, 2, input, null)).resolves.toBe("saved");
    expect(supabase.from).toHaveBeenCalledTimes(3);
    const updateBuilder = supabase.from.mock.results[2]?.value as {
      update: { mock: { calls: unknown[][] } };
      eq: { mock: { calls: unknown[][] } };
    };
    expect(updateBuilder.update.mock.calls[0]?.[0]).toMatchObject({ user_id: 2 });
    expect(updateBuilder.eq.mock.calls).toEqual([
      ["id", 1],
      ["endpoint", input.endpoint],
    ]);
  });

  it("新規購読が上限を超えると limit_exceeded", async () => {
    const atCap = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS_PER_USER }, (_, index) => ({
      id: index + 1,
    }));
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_subscriptions: [
          { data: null, error: null },
          { data: atCap, error: null },
        ],
      },
    });

    await expect(savePushSubscription(supabase as never, 2, input, null)).resolves.toBe(
      "limit_exceeded"
    );
  });

  it("自分の endpoint の更新は上限でも許可する", async () => {
    const atCap = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS_PER_USER }, (_, index) => ({
      id: index + 1,
    }));
    const supabase = createMockSupabaseClient({
      tableResults: {
        push_subscriptions: [
          { data: { id: 1, user_id: 2 }, error: null },
          { data: null, error: null },
        ],
      },
    });

    await expect(savePushSubscription(supabase as never, 2, input, null)).resolves.toBe("saved");
    expect(atCap).toHaveLength(MAX_PUSH_SUBSCRIPTIONS_PER_USER);
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
