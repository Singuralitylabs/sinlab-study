import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/user-email-server");
vi.mock("@/app/services/api/user-profile-server");
vi.mock("@/app/services/api/notification-email-server");
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import SettingsPage from "@/app/(authenticated)/settings/page";
import { fetchNotificationEmailState } from "@/app/services/api/notification-email-server";
import { fetchUserEmailOptOutAt } from "@/app/services/api/user-email-server";
import { fetchUserDisplayName } from "@/app/services/api/user-profile-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const auth = (overrides: Record<string, unknown> = {}) =>
  ({
    user: { id: "u" },
    userId: 5,
    userStatus: "active",
    userRole: "member",
    membershipType: "general",
    ...overrides,
  }) as never;

const render = async (searchParams: { notification_email?: string } = {}) =>
  renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve(searchParams) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(auth());
  vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({ data: null, error: null });
  vi.mocked(fetchUserDisplayName).mockResolvedValue({ data: "山田 太郎", error: null });
  vi.mocked(fetchNotificationEmailState).mockResolvedValue({
    data: {
      loginEmail: "login@example.com",
      notificationEmail: "notify@example.com",
      pendingEmail: null,
      pendingExpiresAt: null,
    },
    error: null,
  });
});

describe("/settings", () => {
  it("userId が無ければ /login へリダイレクトする", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
      membershipType: null,
    } as never);

    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("3タイル（プロフィール・通知・プラン）に現在値を出す (#420)", async () => {
    const html = await render();

    expect(fetchUserEmailOptOutAt).toHaveBeenCalledWith(5);
    expect(html).toContain("プロフィール・通知・プランを確認・変更できます");
    expect(html.match(/data-slot="card"/g)?.length).toBe(3);
    expect(html).toContain(">プロフィール<");
    expect(html).toContain(">通知<");
    expect(html).toContain(">プラン<");
    expect(html).toContain("山田 太郎");
    expect(html).toContain("notify@example.com");
    expect(html).toContain("案内メール: 配信中");
    expect(html).toContain("一般有料会員");
    expect(html).toContain('href="/upgrade"');
    expect(html).toContain('aria-label="プロフィールを編集"');
    expect(html).toContain('aria-label="通知設定を編集"');
    expect(html).not.toContain("管理者・メンテナーには案内メールは送信されません");
  });

  it("確認待ちがあるとき通知タイルに表示する", async () => {
    vi.mocked(fetchNotificationEmailState).mockResolvedValue({
      data: {
        loginEmail: "login@example.com",
        notificationEmail: null,
        pendingEmail: "pending@example.com",
        pendingExpiresAt: "2099-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const html = await render();

    expect(html).toContain("確認待ち");
    expect(html).toContain("pending@example.com");
  });

  it("notification_email=confirmed で結果バナーを出す", async () => {
    const html = await render({ notification_email: "confirmed" });

    expect(html).toContain("通知の送り先を変更しました");
  });

  it("停止中はタイルに案内メール: 停止中を出す", async () => {
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({
      data: "2026-10-14T00:00:00.000Z",
      error: null,
    });

    const html = await render();

    expect(html).toContain("案内メール: 停止中");
  });

  it.each(["admin", "maintainer"])("%s には送信対象外の注記をタイルに出す", async (role) => {
    vi.mocked(getServerAuth).mockResolvedValue(auth({ userRole: role, membershipType: null }));

    const html = await render();

    expect(html).toContain("管理者・メンテナーには案内メールは送信されません");
  });

  it("お試しユーザーはプランタイルにお試しユーザーと出す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue(auth({ userStatus: "trial", membershipType: null }));

    const html = await render();

    expect(html).toContain("お試しユーザー");
  });

  it("配信設定の取得に失敗したらタイルにエラー要約を出す", async () => {
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });

    const html = await render();

    expect(html).toContain("配信状態を取得できません");
  });

  it("表示名の取得に失敗したらタイルにエラーを出し入力を出さない", async () => {
    vi.mocked(fetchUserDisplayName).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });

    const html = await render();

    expect(html).toContain("表示名を取得できませんでした");
    expect(html).not.toContain('id="display-name"');
  });
});
