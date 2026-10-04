import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/(authenticated)/certificates/[id]/PrintButton", () => ({
  PrintButton: () => createElement("button", { type: "button" }, "印刷 / PDF で保存"),
}));

import CertificateDetailPage from "@/app/(authenticated)/certificates/[id]/page";
import { fetchMyCertificateById } from "@/app/services/api/certificates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const certificate = {
  id: 31,
  user_id: 2,
  theme_id: 5,
  certificate_no: "SS-202610-ABC123",
  recipient_name: "山田 太郎",
  theme_name: "GAS 学習（基礎編）",
  issued_at: "2026-10-04T03:00:00Z",
  created_at: "2026-10-04T03:00:00Z",
};

const render = async (id: string) =>
  renderToStaticMarkup(await CertificateDetailPage({ params: Promise.resolve({ id }) } as never));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth" },
    userId: 2,
    userStatus: "active",
    userRole: "member",
  } as never);
  vi.mocked(fetchMyCertificateById).mockResolvedValue({ data: certificate, error: null });
});

describe("/certificates/[id]", () => {
  it("本人の修了証には受講者名・テーマ名・証明番号・印刷ボタン・X 共有リンクを表示する", async () => {
    const html = await render("31");

    expect(fetchMyCertificateById).toHaveBeenCalledWith(2, 31);
    expect(html).toContain("山田 太郎");
    expect(html).toContain("GAS 学習（基礎編）");
    expect(html).toContain("SS-202610-ABC123");
    expect(html).toContain("印刷 / PDF で保存");
    expect(html).toContain("https://twitter.com/intent/tweet?");
    expect(html).toContain("@page { size: A4 landscape; margin: 0; }");
  });

  it("他人の修了証・存在しない ID は 404", async () => {
    vi.mocked(fetchMyCertificateById).mockResolvedValue({ data: null, error: null });

    await expect(render("31")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it.each(["abc", "0", "-1"])("不正な ID（%s）は DB を引かず 404", async (id) => {
    await expect(render(id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(fetchMyCertificateById).not.toHaveBeenCalled();
  });

  it("ユーザー ID が取れない場合は 404", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ user: null, userId: null } as never);

    await expect(render("31")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
