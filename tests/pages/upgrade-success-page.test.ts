import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/stripe-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/stripe-server")>()),
  getStripeClient: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
}));
vi.mock("@/app/services/notifications/user-emails");

import UpgradeSuccessPage from "@/app/(authenticated)/upgrade/success/page";
import { getStripeClient, retrieveCheckoutSession } from "@/app/services/api/stripe-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const TRIAL_USER_ID = 42;

const ownSession = {
  id: "cs_own",
  mode: "subscription",
  payment_link: null,
  payment_status: "paid",
  client_reference_id: String(TRIAL_USER_ID),
  metadata: { user_id: String(TRIAL_USER_ID), auth_id: "auth-42" },
  customer: "cus_42",
  subscription: "sub_42",
};

const render = async () =>
  renderToStaticMarkup(
    await UpgradeSuccessPage({ searchParams: Promise.resolve({ session_id: "cs_x" }) })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_ENABLED", "true");
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-42" },
    userId: TRIAL_USER_ID,
    userStatus: "trial",
    userRole: "member",
  } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/upgrade/success の自己昇格防止", () => {
  it.each([
    {
      // The shared account's subscription Payment Link with ?client_reference_id=42 appended.
      label: "共用アカウントの subscription モードの Payment Link",
      session: {
        ...ownSession,
        payment_link: "plink_x",
        metadata: {},
      },
    },
    {
      label: "metadata.auth_id の無いセッション",
      session: { ...ownSession, metadata: { user_id: String(TRIAL_USER_ID) } },
    },
  ])("$label で決済済みでも、client_reference_id が本人でも昇格させない", async ({ session }) => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.mocked(retrieveCheckoutSession).mockResolvedValue(session as never);

    const html = await render();

    expect(html).toContain("決済情報を確認できませんでした");
    expect(html).not.toContain("ご登録が完了しました");
    expect(mockClient.from).not.toHaveBeenCalled();
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it("metadata.auth_id がセッションのユーザーと一致しなければ、ミラーも users も書かない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: { auth_id: "auth-42" }, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(retrieveCheckoutSession).mockResolvedValue({
      ...ownSession,
      metadata: { user_id: String(TRIAL_USER_ID), auth_id: "auth-someone-else" },
    } as never);

    const html = await render();

    expect(html).not.toContain("ご登録が完了しました");
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("users");
    const ownerQuery = mockClient.from.mock.results[0].value;
    expect(ownerQuery.update).not.toHaveBeenCalled();
    expect(getStripeClient).not.toHaveBeenCalled();
  });
});
