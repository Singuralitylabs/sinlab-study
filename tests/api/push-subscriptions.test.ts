import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server", () => ({
  createAdminSupabaseClient: vi.fn().mockResolvedValue({ from: vi.fn() }),
}));
vi.mock("@/app/services/api/push-subscriptions-server");

import { DELETE, POST } from "@/app/api/push/subscriptions/route";
import {
  deletePushSubscription,
  savePushSubscription,
} from "@/app/services/api/push-subscriptions-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const subscription = {
  endpoint: "https://push.example/device",
  keys: { p256dh: "p256", auth: "authkey" },
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:ops@example.com");
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(savePushSubscription).mockResolvedValue("saved");
  vi.mocked(deletePushSubscription).mockResolvedValue("deleted");
});

describe("POST /api/push/subscriptions", () => {
  it("未認証は401で、保存しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    expect((await post(subscription)).status).toBe(401);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("rejected は403で、保存しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    expect((await post(subscription)).status).toBe(403);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("スキーマ不正と他人の user_id は400", async () => {
    expect((await post({ endpoint: "not-a-url" })).status).toBe(400);
    expect((await post({ ...subscription, user_id: 99 })).status).toBe(400);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("環境変数が無ければ503で、保存しない", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "");

    expect((await post(subscription)).status).toBe(503);
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("保存する user_id は認証済みの本人だけ", async () => {
    const res = await post(subscription);

    expect(res.status).toBe(200);
    expect(savePushSubscription).toHaveBeenCalledWith(
      expect.anything(),
      memberAuth.userId,
      subscription,
      null
    );
  });

  it("別ユーザーの endpoint は409", async () => {
    vi.mocked(savePushSubscription).mockResolvedValue("conflict");

    expect((await post(subscription)).status).toBe(409);
  });
});

describe("DELETE /api/push/subscriptions", () => {
  it("本人の endpoint だけを削除する", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/push/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
    );

    expect(res.status).toBe(200);
    expect(deletePushSubscription).toHaveBeenCalledWith(
      expect.anything(),
      memberAuth.userId,
      subscription.endpoint
    );
  });
});
