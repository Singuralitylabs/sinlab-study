import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");
// Keep the real status constants; mock only getStripeClient().
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  getStripeClient: vi.fn(),
}));
vi.mock("@/app/services/notifications/user-emails");
vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

import { track } from "@vercel/analytics/server";
import { getStripeClient } from "@/app/services/api/stripe-server";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  extractUserId,
  findMirrorOwner,
  isForeignCheckoutSession,
  reactivateUserFromMirror,
  releaseEventClaim,
  revertUserToTrial,
  syncSubscriptionStatus,
} from "@/app/services/api/stripe-webhook-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import {
  scheduleCancelScheduledEmail,
  scheduleSubscriptionEndedEmail,
  scheduleUpgradedEmail,
} from "@/app/services/notifications/user-emails";

const dbError = { message: "db error", code: "PGRST001" };

type MockClientOptions = NonNullable<Parameters<typeof createMockSupabaseClient>[0]>;
type TableResult = NonNullable<MockClientOptions["tableResults"]>[string];

/** activateUserFromCheckoutSession() first reads the session owner's auth_id from users. */
const OWNER_ROW = { data: { auth_id: "auth-uuid" }, error: null };

function mockActivateClient(options: MockClientOptions = {}) {
  const users: TableResult = options.tableResults?.users ?? { data: null, error: null };
  return createMockSupabaseClient({
    ...options,
    tableResults: {
      ...options.tableResults,
      users: [OWNER_ROW, ...(Array.isArray(users) ? users : [users])],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractUserId", () => {
  it("10進の正の整数の client_reference_id を返す", () => {
    expect(extractUserId("42", null)).toBe(42);
  });

  it("client_reference_id が無ければ metadata.user_id を使う", () => {
    expect(extractUserId(null, { user_id: "19" })).toBe(19);
  });

  it.each(["0x2a", "4.2e1", " ", " 42", "42 ", "+42", "-1", "0", "4.2", "abc", ""])(
    "%j はユーザーidとして受け付けない",
    (raw) => {
      expect(extractUserId(raw, null)).toBeNull();
      expect(extractUserId(null, { user_id: raw })).toBeNull();
    }
  );

  it("どちらも無ければ null を返す", () => {
    expect(extractUserId(null, null)).toBeNull();
    expect(extractUserId(null, {})).toBeNull();
  });

  it("client_reference_id と metadata.user_id が両方あって一致すればそのidを返す", () => {
    expect(extractUserId("42", { user_id: "42" })).toBe(42);
  });

  it("client_reference_id と metadata.user_id が食い違えば、どちらも信用せず null を返す", () => {
    // A buyer can override client_reference_id via the Payment Link URL, but not metadata.
    expect(extractUserId("42", { user_id: "19" })).toBeNull();
  });

  it.each(["042", "9007199254740993", "１２"])("%j はユーザーidとして受け付けない", (raw) => {
    expect(extractUserId(raw, null)).toBeNull();
  });
});

describe("isForeignCheckoutSession", () => {
  const own = { mode: "subscription", payment_link: null, metadata: { auth_id: "auth-uuid" } };

  it("createCheckoutSession() が作る形のセッションは自アプリのもの", () => {
    expect(isForeignCheckoutSession(own as never)).toBe(false);
  });

  it.each([
    ["payment_link 付き", { ...own, payment_link: "plink_x" }],
    ["metadata.auth_id 無し", { ...own, metadata: { user_id: "42" } }],
    ["metadata 無し", { ...own, metadata: null }],
    ["mode が payment", { ...own, mode: "payment" }],
  ])("%s は他用途のセッション", (_label, session) => {
    expect(isForeignCheckoutSession(session as never)).toBe(true);
  });
});

describe("findMirrorOwner", () => {
  it.each([
    ["行があれば所有者のユーザーidを返す", { id: 1 }, 1],
    ["行が無ければ null を返す", null, null],
  ])("%s", async (_label, row, userId) => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: row ? { user_id: 1 } : null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await findMirrorOwner("stripe_customer_id", "cus_1");

    expect(result).toEqual({ error: null, userId });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("stripe_customer_id", "cus_1");
  });

  it("DBエラーはエラーを返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await expect(findMirrorOwner("stripe_subscription_id", "sub_1")).resolves.toEqual({
      error: dbError.message,
      userId: null,
    });
  });
});

describe("activateUserFromCheckoutSession", () => {
  const baseSession = {
    id: "cs_123",
    mode: "subscription",
    payment_link: null,
    client_reference_id: "1",
    metadata: { user_id: "1", auth_id: "auth-uuid" },
    customer: "cus_123",
    subscription: "sub_123",
  };

  const subscription = {
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  };

  it("既存行が無ければstripe_subscriptionsへINSERTし、usersをactive/generalに更新する", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    expect(result.currentPeriodEnd).toBe(new Date(1750000000 * 1000).toISOString());
    const subBuilder = mockClient.from.mock.results[2].value;
    expect(subBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 1,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        status: "active",
      })
    );
    const userBuilder = mockClient.from.mock.results[3].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "general" })
    );
    expect(userBuilder.neq).toHaveBeenCalledWith("status", "rejected");
  });

  it("同一契約（stripe_subscription_idが一致）の既存行はミラーを上書きし、昇格する", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: [
          {
            data: {
              stripe_subscription_id: "sub_123",
              status: "past_due",
              checkout_claimed_at: null,
              checkout_session_id: null,
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    const subBuilder = mockClient.from.mock.results[2].value;
    expect(subBuilder.update).toHaveBeenCalled();
    // Write only if the observed ownership state is unchanged (CAS).
    expect(subBuilder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
    expect(subBuilder.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
  });

  it("別の契約が現行（終端状態でない）として記録済みの場合、古いセッションのリプレイでミラーを上書きしない", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: {
          data: { stripe_subscription_id: "sub_other", status: "active" },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(false);
    expect(result.currentPeriodEnd).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("別の契約が現行でも、既に終端状態（解約済み等）ならリプレイでの上書きを許可する", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: [
          { data: { stripe_subscription_id: "sub_other", status: "canceled" }, error: null },
          { data: null, error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
  });

  it("Checkout手続き中（claim済み）の行はリプレイ扱いせず、ミラーを更新して昇格する", async () => {
    // A claim row has no stripe_subscription_id and a sentinel status; misreading it as "another
    // current contract recorded" would lose the promotion of the Checkout that just completed.
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: [
          {
            data: {
              stripe_subscription_id: null,
              status: "checkout_pending",
              checkout_claimed_at: "2026-08-10T00:00:00.000Z",
              checkout_session_id: "cs_123",
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(true);
    const subBuilder = mockClient.from.mock.results[2].value;
    expect(subBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        checkout_claimed_at: null,
        checkout_session_id: null,
      })
    );
    // Release only if the observed claim is still held (CAS).
    expect(subBuilder.eq).toHaveBeenCalledWith("checkout_claimed_at", "2026-08-10T00:00:00.000Z");
  });

  it("確認後に行が変わった場合は書き込まず、競合が解消しなければエラーを返す（再送に委ねる）", async () => {
    // A conditional UPDATE matching 0 rows means the claim moved between check and write.
    const existing = {
      data: {
        stripe_subscription_id: "sub_123",
        status: "past_due",
        checkout_claimed_at: null,
        checkout_session_id: null,
      },
      error: null,
    };
    const noRowUpdated = { data: [], error: null };
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: [
          existing,
          noRowUpdated,
          existing,
          noRowUpdated,
          existing,
          noRowUpdated,
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toContain("競合");
    expect(result.activated).toBe(false);
  });

  it("進行中のCheckout（別セッションのclaim）は古いセッションのリプレイで解除されない", async () => {
    // Scenario: a canceled user starts upgrading again, then revisits an old success page URL.
    // Releasing the claim here would let a next Checkout be created while a payable session
    // remains.
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: {
          data: {
            stripe_subscription_id: null,
            status: "checkout_pending",
            checkout_claimed_at: "2026-08-10T00:00:00.000Z",
            checkout_session_id: "cs_in_progress",
          },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBeNull();
    expect(result.activated).toBe(false);
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("client_reference_idが無い場合はmetadata.user_idにフォールバックする", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      client_reference_id: null,
    } as never);

    expect(result.error).toBeNull();
  });

  it("ユーザーIDを特定できない場合は恒久的な拒否（user_unidentified）を返し、DBを更新しない", async () => {
    const mockClient = mockActivateClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      metadata: { auth_id: "auth-1" },
      client_reference_id: null,
    } as never);

    expect(result).toEqual({
      error: null,
      rejection: "user_unidentified",
      activated: false,
      currentPeriodEnd: null,
    });
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "共用アカウントの subscription モードの Payment Link（client_reference_id だけ付与）",
      { payment_link: "plink_x", metadata: {} },
    ],
    ["metadata.auth_id の無いセッション", { metadata: { user_id: "1" } }],
    ["mode が subscription でないセッション", { mode: "payment" }],
  ])(
    "自アプリ以外の Checkout Session（%s）は恒久的な拒否（foreign）を返し、DBもStripeも触らない",
    async (_label, overrides) => {
      const mockClient = mockActivateClient();
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await activateUserFromCheckoutSession({
        ...baseSession,
        ...overrides,
      } as never);

      expect(result).toEqual({
        error: null,
        rejection: "foreign",
        activated: false,
        currentPeriodEnd: null,
      });
      expect(mockClient.from).not.toHaveBeenCalled();
      expect(getStripeClient).not.toHaveBeenCalled();
    }
  );

  it("client_reference_id と metadata.user_id が食い違う場合はユーザーを特定できない", async () => {
    const mockClient = mockActivateClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await activateUserFromCheckoutSession({
      ...baseSession,
      client_reference_id: "42",
    } as never);

    expect(result.rejection).toBe("user_unidentified");
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it.each([
    ["metadata.auth_id が別人", { data: { auth_id: "auth-other" }, error: null }],
    ["ユーザーが存在しない", { data: null, error: null }],
  ])(
    "%s の場合は恒久的な拒否（owner_mismatch）を返し、ミラーも users も書かない",
    async (_label, owner) => {
      const mockClient = createMockSupabaseClient({ tableResults: { users: owner } });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      const retrieve = vi.fn();
      vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result).toEqual({
        error: null,
        rejection: "owner_mismatch",
        activated: false,
        currentPeriodEnd: null,
      });
      expect(mockClient.from).toHaveBeenCalledTimes(1);
      const ownerQuery = mockClient.from.mock.results[0].value;
      expect(ownerQuery.select).toHaveBeenCalledWith("auth_id");
      expect(ownerQuery.eq).toHaveBeenCalledWith("id", 1);
      expect(ownerQuery.update).not.toHaveBeenCalled();
      expect(retrieve).not.toHaveBeenCalled();
    }
  );

  it("セッションのユーザーの取得に失敗した場合はエラーを返し、ミラーを書かない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBe(dbError.message);
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["subscription", { subscription: null }],
    ["customer", { customer: null }],
  ])(
    "%s が無い完了済みセッションは恒久的な拒否（missing_stripe_ids）を返し、DBを触らない",
    async (_label, missing) => {
      const mockClient = mockActivateClient();
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await activateUserFromCheckoutSession({
        ...baseSession,
        ...missing,
      } as never);

      // Retrying cannot add the ids, so this must not look like a transient error.
      expect(result).toEqual({
        error: null,
        rejection: "missing_stripe_ids",
        activated: false,
        currentPeriodEnd: null,
      });
      expect(mockClient.from).not.toHaveBeenCalled();
    }
  );

  it("既存行チェックに失敗した場合はエラーを返す", async () => {
    const mockClient = mockActivateClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBe(dbError.message);
    expect(result.activated).toBe(false);
  });

  it("stripe_subscriptions更新（upsert）に失敗した場合はエラーを返す", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: [
          { data: null, error: null },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.error).toBe(dbError.message);
    expect(result.activated).toBe(false);
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired"])(
    "サブスクが現に有効でない（%s）場合、stripe_subscriptionsのみ更新しusersは昇格しない",
    async (status) => {
      const mockClient = mockActivateClient({
        tableResults: { stripe_subscriptions: { data: null, error: null } },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue({ ...subscription, status }) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result.error).toBeNull();
      expect(result.activated).toBe(false);
      // When not promoted, currentPeriodEnd is null even if fetched from Stripe: entitlement is
      // unchanged, so the success page must not show a real billing date.
      expect(result.currentPeriodEnd).toBeNull();
      // Only the existing-row check + upsert, no users update (prevents promotion via a revisited
      // success URL after cancellation, or an unpaid checkout completion such as convenience-store
      // payment).
      expect(mockClient.from).toHaveBeenCalledTimes(3);
    }
  );

  describe("expectedClaimedAt（Checkout APIの自己復旧 #250）", () => {
    const heldClaimedAt = "2026-09-20T00:00:00+00:00";
    const pendingRow = (claimedAt: string | null) => ({
      stripe_subscription_id: null,
      status: "checkout_pending",
      checkout_claimed_at: claimedAt,
      checkout_session_id: null,
    });

    it("観測した処理権のままなら、通常どおりミラーを書き処理権を解除する", async () => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: [
            { data: pendingRow(heldClaimedAt), error: null },
            { data: [{ id: 1 }], error: null },
          ],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never, {
        expectedClaimedAt: heldClaimedAt,
      });

      expect(result).toMatchObject({ error: null, activated: true });
      const subBuilder = mockClient.from.mock.results[2].value;
      expect(subBuilder.eq).toHaveBeenCalledWith("checkout_claimed_at", heldClaimedAt);
    });

    it.each([
      ["別リクエストが確保し直した処理権", "2026-09-26T02:00:00+00:00"],
      ["解放済み", null],
    ])(
      "処理権が入れ替わっていれば（%s）何も書かず、Stripeにも問い合わせない",
      async (_label, currentClaimedAt) => {
        const retrieve = vi.fn().mockResolvedValue(subscription);
        const mockClient = mockActivateClient({
          tableResults: {
            stripe_subscriptions: { data: pendingRow(currentClaimedAt), error: null },
          },
        });
        vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
        vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

        const result = await activateUserFromCheckoutSession(baseSession as never, {
          expectedClaimedAt: heldClaimedAt,
        });

        expect(result).toEqual({ error: null, activated: false, currentPeriodEnd: null });
        expect(mockClient.from).toHaveBeenCalledTimes(2);
        expect(retrieve).not.toHaveBeenCalled();
      }
    );

    it("読んだ後に処理権が入れ替わった場合は、CASで書き込めず読み直して何もしない", async () => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: [
            { data: pendingRow(heldClaimedAt), error: null },
            { data: [], error: null },
            { data: pendingRow("2026-09-26T02:00:00+00:00"), error: null },
          ],
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
      } as never);

      const result = await activateUserFromCheckoutSession(baseSession as never, {
        expectedClaimedAt: heldClaimedAt,
      });

      expect(result).toEqual({ error: null, activated: false, currentPeriodEnd: null });
      expect(mockClient.from).toHaveBeenCalledTimes(4);
    });
  });
});

describe("reactivateUserFromMirror", () => {
  const liveSubscription = (status: string) => ({
    id: "sub_123",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  });
  const activeRow = {
    stripe_subscription_id: "sub_123",
    status: "active",
    checkout_claimed_at: null,
  };

  it("ミラー行が有効な契約で、Stripeのライブ状態も有効なら、ミラーを更新して昇格する", async () => {
    const retrieve = vi.fn().mockResolvedValue(liveSubscription("active"));
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [{ id: 1 }], error: null },
        ],
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: true });
    expect(retrieve).toHaveBeenCalledWith("sub_123");
    const subBuilder = mockClient.from.mock.results[1].value;
    // Update only the row still on the same contract/state with no claim as read, so a stale
    // snapshot doesn't overwrite a `canceled` written by a concurrent cancel webhook.
    expect(subBuilder.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_123");
    expect(subBuilder.eq).toHaveBeenCalledWith("status", "active");
    expect(subBuilder.is).toHaveBeenCalledWith("checkout_claimed_at", null);
    const userBuilder = mockClient.from.mock.results[2].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", membership_type: "general" })
    );
    expect(userBuilder.neq).toHaveBeenCalledWith("status", "rejected");
  });

  it.each([
    ["行が無い", null],
    ["契約が記録されていない", { ...activeRow, stripe_subscription_id: null }],
    ["手続き中（処理権あり）", { ...activeRow, checkout_claimed_at: "2026-09-26T00:00:00+00:00" }],
    ["解約済み", { ...activeRow, status: "canceled" }],
    ["手続き中の番兵値", { ...activeRow, status: "checkout_pending" }],
  ])("ミラー行が対象外（%s）なら何もしない", async (_label, row) => {
    const retrieve = vi.fn();
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: row, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(retrieve).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it.each(["incomplete", "past_due"])(
    "ミラー行が %s のままでも、Stripe上で有効になっていれば昇格する（Webhookが届かなかった場合）",
    async (mirrorStatus) => {
      const retrieve = vi.fn().mockResolvedValue(liveSubscription("active"));
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: { ...activeRow, status: mirrorStatus }, error: null },
            { data: [{ id: 1 }], error: null },
          ],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      vi.mocked(getStripeClient).mockReturnValue({ subscriptions: { retrieve } } as never);

      const result = await reactivateUserFromMirror(1);

      expect(result).toEqual({ error: null, activated: true });
      expect(retrieve).toHaveBeenCalledWith("sub_123");
      const subBuilder = mockClient.from.mock.results[1].value;
      expect(subBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
      expect(subBuilder.eq).toHaveBeenCalledWith("status", mirrorStatus);
    }
  );

  it("Stripeのライブ状態が有効でなければ、ミラーだけ更新して昇格しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(liveSubscription("canceled")) },
    } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("読んだ後に行が変わっていれば（更新0行）昇格しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: [
          { data: activeRow, error: null },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(liveSubscription("active")) },
    } as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: null, activated: false });
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("DBエラーはエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_subscriptions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await reactivateUserFromMirror(1);

    expect(result).toEqual({ error: dbError.message, activated: false });
  });
});

describe("syncSubscriptionStatus", () => {
  const makeSubscription = (status: string) => ({
    id: "sub_123",
    status,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  });

  // Webhook delivery order isn't guaranteed, so use the live state re-fetched from Stripe, not the
  // event snapshot. Tests set the re-fetched state via mockGetStripeClient.
  const mockGetStripeClient = (liveStatus: string) => {
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ ...makeSubscription(liveStatus) }),
      },
    } as never);
  };

  it("canceledへ遷移した場合、ミラー更新に加えrevertUserToTrialを呼ぶ", async () => {
    mockGetStripeClient("canceled");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("canceled") as never, 7);

    expect(result.error).toBeNull();
    const userBuilder = mockClient.from.mock.results[1].value;
    expect(userBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trial", membership_type: null })
    );
    expect(userBuilder.eq).toHaveBeenNthCalledWith(2, "membership_type", "general");
  });

  it("呼び出し元が解決済みのミラー行の所有者を使い、ミラー行を引き直さない", async () => {
    mockGetStripeClient("canceled");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("canceled") as never, 7);

    expect(result.error).toBeNull();
    const mirrorBuilder = mockClient.from.mock.results[0].value;
    expect(mirrorBuilder.select).not.toHaveBeenCalled();
    expect(mirrorBuilder.update).toHaveBeenCalled();
    const userBuilder = mockClient.from.mock.results[1].value;
    expect(userBuilder.eq).toHaveBeenNthCalledWith(1, "id", 7);
  });

  it.each(["unpaid", "incomplete_expired"])(
    "%sへ遷移した場合もrevertUserToTrialを呼ぶ",
    async (status) => {
      mockGetStripeClient(status);
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: { data: null, error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

      await syncSubscriptionStatus(makeSubscription(status) as never, 7);

      const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
      expect(usersCalls).toHaveLength(1);
    }
  );

  it.each([
    [
      "cancel_at が設定されていればISO文字列で",
      1760886000,
      new Date(1760886000 * 1000).toISOString(),
    ],
    ["cancel_at が未設定ならnullで", null, null],
  ])(
    "ミラーへ %s cancel_at を書き込む（flexible billing mode の解約予約）",
    async (_label, cancelAt, expected) => {
      vi.mocked(getStripeClient).mockReturnValue({
        subscriptions: {
          retrieve: vi
            .fn()
            .mockResolvedValue({ ...makeSubscription("active"), cancel_at: cancelAt }),
        },
      } as never);
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

      await syncSubscriptionStatus(makeSubscription("active") as never, 7);

      expect(mockClient.from.mock.results[0].value.update).toHaveBeenCalledWith(
        expect.objectContaining({ cancel_at_period_end: false, cancel_at: expected })
      );
    }
  );

  it("past_dueの場合はミラー更新のみで降格しない", async () => {
    mockGetStripeClient("past_due");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await syncSubscriptionStatus(makeSubscription("past_due") as never, 7);

    expect(result.error).toBeNull();
    const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
    expect(usersCalls).toHaveLength(0);
  });

  it("イベントのスナップショットではなく、Stripe APIから再取得したライブ状態を書き込む（順序逆転対策）", async () => {
    mockGetStripeClient("canceled");
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: null, error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    await syncSubscriptionStatus(makeSubscription("active") as never, 7);

    const subBuilder = mockClient.from.mock.results[0].value;
    expect(subBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
    const usersCalls = mockClient.from.mock.calls.filter(([table]) => table === "users");
    expect(usersCalls).toHaveLength(1);
  });
});

describe("revertUserToTrial", () => {
  it("membership_type='general'の行のみを対象にUPDATEする", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result.error).toBeNull();
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "trial", membership_type: null })
    );
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", 9);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "membership_type", "general");
  });

  it("更新に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result.error).toBe(dbError.message);
    expect(result.reverted).toBe(false);
  });

  it("更新有無を判定するためselect('id')を付け、1行以上ならreverted=trueを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 9 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result).toEqual({ error: null, reverted: true });
    expect(mockClient.from.mock.results[0].value.select).toHaveBeenCalledWith("id");
  });

  it("membership_type=generalガードで更新されなかった場合はreverted=falseを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await revertUserToTrial(9);

    expect(result).toEqual({ error: null, reverted: false });
    expect(track).not.toHaveBeenCalled();
  });

  it("行を更新したときだけ subscription_ended を送り、失敗しても reverted は変わらない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: [{ id: 9 }], error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(track).mockRejectedValueOnce(new Error("analytics down"));

    const result = await revertUserToTrial(9);

    expect(result).toEqual({ error: null, reverted: true });
    expect(track).toHaveBeenCalledWith("subscription_ended");
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("email");
  });
});

describe("checkout_completed", () => {
  const baseSession = {
    id: "cs_123",
    mode: "subscription",
    payment_link: null,
    client_reference_id: "1",
    metadata: { user_id: "1", auth_id: "auth-uuid" },
    customer: "cus_123",
    subscription: "sub_123",
  };
  const subscription = {
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1750000000 }] },
  };

  function mockStripe() {
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);
  }

  it("行を昇格した初回だけ送り、プロパティは付けない", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    mockStripe();
    vi.mocked(track).mockRejectedValueOnce(new Error("analytics down"));

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result).toMatchObject({ error: null, activated: true });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("checkout_completed");
  });

  it("すでに general の再訪（activated は true、行は変わらない）では送らない", async () => {
    const mockClient = mockActivateClient({
      tableResults: {
        stripe_subscriptions: { data: null, error: null },
        users: [
          { data: [], error: null },
          { data: { id: 1 }, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    mockStripe();

    const result = await activateUserFromCheckoutSession(baseSession as never);

    expect(result.activated).toBe(true);
    expect(track).not.toHaveBeenCalled();
  });
});

// Transactional mail hook (#252). Sending itself (after(), the email_logs claim, Resend) lives in
// user-emails; here verify only that a reservation is made with the correct reference_key when the
// main processing succeeds.
describe("トランザクションメールのフック", () => {
  const baseSession = {
    id: "cs_123",
    mode: "subscription",
    payment_link: null,
    client_reference_id: "1",
    metadata: { user_id: "1", auth_id: "auth-uuid" },
    customer: "cus_123",
    subscription: "sub_123",
  };
  const periodEndUnix = 1750000000;
  const periodEndIso = new Date(periodEndUnix * 1000).toISOString();
  const liveSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    discounts: [],
    items: {
      data: [
        {
          current_period_end: periodEndUnix,
          quantity: 1,
          price: {
            unit_amount: 1500,
            currency: "jpy",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    ...overrides,
  });
  const mockRetrieve = (subscription: unknown) => {
    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
    } as never);
  };

  describe("upgraded（activateUserFromCheckoutSession）", () => {
    it("昇格したときだけ、契約idをキーに実請求額・次回請求日つきで予約する", async () => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription());

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result.activated).toBe(true);
      expect(scheduleUpgradedEmail).toHaveBeenCalledTimes(1);
      expect(scheduleUpgradedEmail).toHaveBeenCalledWith({
        userId: 1,
        subscriptionId: "sub_123",
        monthlyAmountJpy: 1500,
        currentPeriodEnd: periodEndIso,
      });
    });

    it("既に一般有料会員（successページの再訪・Webhookの再送）なら、昇格扱いのまま予約しない", async () => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          // First call: update only rows that are "not yet general paid members" (0 rows); second:
          // current state.
          users: [
            { data: [], error: null },
            { data: { id: 1 }, error: null },
          ],
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription());

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result.activated).toBe(true);
      expect(result.currentPeriodEnd).toBe(periodEndIso);
      const usersBuilders = mockClient.from.mock.calls
        .map(([table], index) => ({ table, builder: mockClient.from.mock.results[index].value }))
        .filter(({ table }) => table === "users")
        .map(({ builder }) => builder);
      expect(usersBuilders[1].or).toHaveBeenCalledWith(
        "status.neq.active,membership_type.is.null,membership_type.neq.general"
      );
      expect(usersBuilders[2].eq).toHaveBeenCalledWith("membership_type", "general");
      expect(scheduleUpgradedEmail).not.toHaveBeenCalled();
    });

    it("割引（クーポン等）が付いた契約では、実請求額と食い違うため料金をnullで渡す", async () => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription({ discounts: ["di_123"] }));

      await activateUserFromCheckoutSession(baseSession as never);

      expect(scheduleUpgradedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyAmountJpy: null })
      );
    });

    it("メールの予約が例外を投げても、昇格の結果には影響しない", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(scheduleUpgradedEmail).mockImplementationOnce(() => {
        throw new Error("unexpected");
      });
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription());

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result).toEqual({ error: null, activated: true, currentPeriodEnd: periodEndIso });
    });

    it.each([
      ["JPY以外", { unit_amount: 1500, currency: "usd", recurring: { interval: "month" } }],
      ["年額", { unit_amount: 15000, currency: "jpy", recurring: { interval: "year" } }],
      ["金額なし", { unit_amount: null, currency: "jpy", recurring: { interval: "month" } }],
    ])("実請求額を月額JPYで確認できない（%s）場合は料金をnullで渡す", async (_label, price) => {
      const mockClient = mockActivateClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(
        liveSubscription({
          items: { data: [{ current_period_end: periodEndUnix, quantity: 1, price }] },
        })
      );

      await activateUserFromCheckoutSession(baseSession as never);

      expect(scheduleUpgradedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyAmountJpy: null })
      );
    });

    it.each([
      [
        "サブスクが有効でない",
        { stripe_subscriptions: { data: null, error: null } },
        { status: "incomplete" },
      ],
      [
        "却下済み等でusersが更新されない",
        {
          stripe_subscriptions: { data: null, error: null },
          users: [
            { data: [], error: null },
            { data: null, error: null },
          ],
        },
        {},
      ],
      [
        "users更新に失敗した",
        {
          stripe_subscriptions: { data: null, error: null },
          users: { data: null, error: dbError },
        },
        {},
      ],
      [
        "古いセッションのリプレイ",
        {
          stripe_subscriptions: {
            data: { stripe_subscription_id: "sub_other", status: "active" },
            error: null,
          },
        },
        {},
      ],
    ])("昇格しなかった（%s）場合は予約しない", async (_label, tableResults, overrides) => {
      const mockClient = mockActivateClient({ tableResults });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription(overrides));

      const result = await activateUserFromCheckoutSession(baseSession as never);

      expect(result.activated).toBe(false);
      expect(scheduleUpgradedEmail).not.toHaveBeenCalled();
    });
  });

  describe("upgraded（reactivateUserFromMirror）", () => {
    const activeRow = {
      stripe_subscription_id: "sub_123",
      status: "incomplete",
      checkout_claimed_at: null,
    };

    it("ミラーからの再昇格でも、契約idをキーに実請求額・次回請求日つきで予約する", async () => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [
            { data: activeRow, error: null },
            { data: [{ id: 1 }], error: null },
          ],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription());

      const result = await reactivateUserFromMirror(1);

      expect(result.activated).toBe(true);
      expect(scheduleUpgradedEmail).toHaveBeenCalledWith({
        userId: 1,
        subscriptionId: "sub_123",
        monthlyAmountJpy: 1500,
        currentPeriodEnd: periodEndIso,
      });
    });

    it.each([
      ["ライブ状態が有効でない", { data: [{ id: 1 }], error: null }, { status: "incomplete" }],
      ["ミラー行が読み取り後に変わった", { data: [], error: null }, {}],
    ])("昇格しなかった（%s）場合は予約しない", async (_label, updateResult, overrides) => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: [{ data: activeRow, error: null }, updateResult],
          users: { data: [{ id: 1 }], error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription(overrides));

      const result = await reactivateUserFromMirror(1);

      expect(result.activated).toBe(false);
      expect(scheduleUpgradedEmail).not.toHaveBeenCalled();
    });
  });

  describe("cancel_scheduled（syncSubscriptionStatus）", () => {
    const setup = (
      writeResult: { data: unknown; error: unknown } = { data: null, error: null }
    ) => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: writeResult,
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      return mockClient;
    };

    it("取り直したライブ状態が解約予約中（cancel_at_period_end）なら、期間末の日付で予約する", async () => {
      const mockClient = setup();
      mockRetrieve(liveSubscription({ cancel_at_period_end: true }));

      const result = await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(result.error).toBeNull();
      // Judged from the live state only; the mirror row's values aren't consulted.
      expect(mockClient.from.mock.results[0].value.select).not.toHaveBeenCalled();
      expect(scheduleCancelScheduledEmail).toHaveBeenCalledWith({
        userId: 7,
        subscriptionId: "sub_123",
        periodEnd: periodEndIso,
      });
      expect(scheduleSubscriptionEndedEmail).not.toHaveBeenCalled();
    });

    it("flexible billing mode の解約（cancel_at のみ設定）でも、cancel_at の日付で予約する", async () => {
      const cancelAtUnix = periodEndUnix - 86_400;
      setup();
      mockRetrieve(liveSubscription({ cancel_at_period_end: false, cancel_at: cancelAtUnix }));

      await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(scheduleCancelScheduledEmail).toHaveBeenCalledWith({
        userId: 7,
        subscriptionId: "sub_123",
        periodEnd: new Date(cancelAtUnix * 1000).toISOString(),
      });
    });

    it("他の経路（successページ再訪・再昇格）が先にミラーへ解約予約を書いていても予約する（重複は送信ログで抑止）", async () => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription({ cancel_at_period_end: true }));

      await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(scheduleCancelScheduledEmail).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["解約予約なし", liveSubscription()],
      [
        "イベントのスナップショットは解約予約中（順序逆転・取り消し後の遅延イベント）",
        liveSubscription({ cancel_at_period_end: true }),
      ],
    ])("ライブ状態が解約予約中でなければ予約しない（%s）", async (_label, eventSubscription) => {
      setup();
      mockRetrieve(liveSubscription());

      await syncSubscriptionStatus(eventSubscription as never, 7);

      expect(scheduleCancelScheduledEmail).not.toHaveBeenCalled();
    });

    it("ミラー更新に失敗した場合は予約せずエラーを返す", async () => {
      setup({ data: null, error: dbError });
      mockRetrieve(liveSubscription({ cancel_at_period_end: true }));

      const result = await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(result.error).toBe(dbError.message);
      expect(scheduleCancelScheduledEmail).not.toHaveBeenCalled();
    });
  });

  describe("subscription_ended（syncSubscriptionStatus → revertUserToTrial）", () => {
    const setup = (usersResult: { data: unknown; error: unknown }) => {
      const mockClient = createMockSupabaseClient({
        tableResults: {
          stripe_subscriptions: { data: null, error: null },
          users: usersResult,
        },
      });
      vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
      mockRetrieve(liveSubscription({ status: "canceled", cancel_at_period_end: false }));
    };

    it("実際に降格したときだけ、契約idをキーに予約する", async () => {
      setup({ data: [{ id: 7 }], error: null });

      const result = await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(result.error).toBeNull();
      expect(scheduleSubscriptionEndedEmail).toHaveBeenCalledWith({
        userId: 7,
        subscriptionId: "sub_123",
      });
      expect(scheduleCancelScheduledEmail).not.toHaveBeenCalled();
    });

    it("membership_type=generalガードで更新されなかった場合（既に降格済み・コミュニティ会員）は予約しない", async () => {
      setup({ data: [], error: null });

      const result = await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(result.error).toBeNull();
      expect(scheduleSubscriptionEndedEmail).not.toHaveBeenCalled();
    });

    it("降格に失敗した場合は予約せずエラーを返す（Webhookは500で再送に委ねる）", async () => {
      setup({ data: null, error: dbError });

      const result = await syncSubscriptionStatus(liveSubscription() as never, 7);

      expect(result.error).toBe(dbError.message);
      expect(scheduleSubscriptionEndedEmail).not.toHaveBeenCalled();
    });
  });
});

// claimEvent uses a plain INSERT on event.id as the claim (not upsert), so of concurrent requests
// with the same event.id only one succeeds via the unique constraint. releaseEventClaim frees it
// only on handler failure so a Stripe retry can claim again.
describe("claimEvent", () => {
  it("未処理のイベントの場合、claimに成功しclaimed=trueを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result.claimed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.processedAt).toEqual(expect.any(String));
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_1", type: "checkout.session.completed" })
    );
  });

  it("既にclaim済み（一意制約違反）でTTL内の場合、再claimせずclaimed=falseをエラー無しで返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: null });
  });

  it("既にclaim済み（一意制約違反）でTTLを超えて放置されている場合、再claimしclaimed=trueを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: [{ id: "evt_1" }], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result.claimed).toBe(true);
    expect(result.error).toBeNull();
    expect(result.processedAt).toEqual(expect.any(String));
    const reclaimBuilder = mockClient.from.mock.results[1].value;
    expect(reclaimBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ processed_at: expect.any(String) })
    );
    expect(reclaimBuilder.eq).toHaveBeenCalledWith("id", "evt_1");
    expect(reclaimBuilder.lt).toHaveBeenCalledWith("processed_at", expect.any(String));
  });

  it("TTLを指定した場合は、その時間を超えて放置されたclaimだけを再claimする（通知の重複抑止用）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T04:00:00.000Z"));
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { code: "23505", message: "duplicate key" } },
          { data: [], error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("checkout_recovery_notice:1:cs_1", "notice", 60);

    expect(result).toEqual({ claimed: false, processedAt: null, error: null });
    const builder = mockClient.from.mock.results[1].value;
    expect(builder.lt).toHaveBeenCalledWith("processed_at", "2026-09-26T03:00:00.000Z");
    vi.useRealTimers();
  });

  it("再claim確認に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        stripe_events: [
          { data: null, error: { message: "duplicate key", code: "23505" } },
          { data: null, error: dbError },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: dbError.message });
  });

  it("一意制約違反以外のDBエラーの場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await claimEvent("evt_1", "checkout.session.completed");

    expect(result).toEqual({ claimed: false, processedAt: null, error: dbError.message });
  });
});

describe("releaseEventClaim", () => {
  it("event.idかつ自分がclaimしたprocessed_atと一致する行のみ削除する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseEventClaim("evt_1", "2026-01-01T00:00:00.000Z");

    expect(result).toEqual({ error: null });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", "evt_1");
    expect(builder.eq).toHaveBeenNthCalledWith(2, "processed_at", "2026-01-01T00:00:00.000Z");
  });

  it("解放に失敗した場合はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { stripe_events: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await releaseEventClaim("evt_1", "2026-01-01T00:00:00.000Z");

    expect(result).toEqual({ error: dbError.message });
  });
});
