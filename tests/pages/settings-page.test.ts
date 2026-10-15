import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/user-email-server");
vi.mock("@/app/services/api/user-profile-server");
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import SettingsPage from "@/app/(authenticated)/settings/page";
import { PRIVACY_URL } from "@/app/constants/legal";
import { fetchUserEmailOptOutAt } from "@/app/services/api/user-email-server";
import { fetchUserDisplayName } from "@/app/services/api/user-profile-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const auth = (userRole: string) =>
  ({ user: { id: "u" }, userId: 5, userStatus: "active", userRole }) as never;

const render = async () => renderToStaticMarkup(await SettingsPage());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(auth("member"));
  vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({ data: null, error: null });
  vi.mocked(fetchUserDisplayName).mockResolvedValue({ data: "山田 太郎", error: null });
});

describe("/settings", () => {
  it("userId が無ければ /login へリダイレクトする", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("配信中は停止ボタンを出し、対象・対象外の説明とプライバシーポリシーへのリンクを表示する", async () => {
    const html = await render();

    expect(fetchUserEmailOptOutAt).toHaveBeenCalledWith(5);
    expect(html).toContain("表示名と案内メールの配信を確認・変更できます");
    expect(html.indexOf(">プロフィール<")).toBeLessThan(html.indexOf(">案内メールの配信<"));
    expect(html).toContain("山田 太郎");
    expect(html).toContain(
      "修了証には発行時点の名前が印字されます。発行済みの修了証には反映されません。"
    );
    expect(html).toContain("保存する");
    expect(html).toContain("配信中");
    expect(html).toContain("案内メールの配信を停止する");
    expect(html).toContain("学習状況のお知らせ・リマインド");
    expect(html).toContain("手続に関する通知");
    expect(html).toContain(`href="${PRIVACY_URL}"`);
    expect(html).not.toContain("案内メールは送信されません");
  });

  it("停止中は停止日時と再開ボタンを出す", async () => {
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({
      data: "2026-10-14T00:00:00.000Z",
      error: null,
    });

    const html = await render();

    expect(html).toContain("停止中");
    expect(html).toContain("停止日時: 2026/10/14 09:00");
    expect(html).toContain("案内メールの配信を再開する");
  });

  it.each(["admin", "maintainer"])("%s には送信対象外の注記を出す（操作は可能）", async (role) => {
    vi.mocked(getServerAuth).mockResolvedValue(auth(role));

    const html = await render();

    expect(html).toContain("案内メールは送信されません");
    expect(html).toContain("案内メールの配信を停止する");
  });

  it("取得に失敗したら操作を出さずエラーを表示する", async () => {
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });

    const html = await render();

    expect(html).toContain("配信設定を取得できませんでした");
    expect(html).not.toContain("案内メールの配信を停止する");
    expect(html).toContain("保存する");
  });

  it("表示名の取得に失敗したら入力欄を出さずエラーを表示する", async () => {
    vi.mocked(fetchUserDisplayName).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });

    const html = await render();

    expect(html).toContain("表示名を取得できませんでした");
    expect(html).not.toContain("保存する");
    expect(html).toContain("案内メールの配信を停止する");
  });
});
