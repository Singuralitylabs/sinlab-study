import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Noto_Serif_JP: () => ({ className: "font-serif-jp", style: { fontFamily: "Serif JP" } }),
  Cormorant_Garamond: () => ({ className: "font-latin-serif", style: { fontFamily: "Latin" } }),
}));
vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/(authenticated)/certificates/[id]/PrintButton", () => ({
  PrintButton: () => createElement("button", { type: "button" }, "印刷 / PDF で保存"),
}));

import CertificateDetailPage from "@/app/(authenticated)/certificates/[id]/page";
import {
  buildCertificateThemeColors,
  resolveCertificateColors,
} from "@/app/lib/certificate-palette";
import {
  fetchCertificateThemeColor,
  fetchMyCertificateById,
} from "@/app/services/api/certificates-server";
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
  vi.mocked(fetchCertificateThemeColor).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/certificates/[id]", () => {
  it("運営団体名は環境変数があるときだけ表示し、未設定・空なら行を出さない", async () => {
    vi.stubEnv("CERTIFICATE_ISSUER_NAME", "");
    expect(await render("31")).not.toContain("運営団体テスト");

    vi.stubEnv("CERTIFICATE_ISSUER_NAME", "  運営団体テスト  ");
    expect(await render("31")).toContain(">運営団体テスト<");
  });

  it("本人の修了証には受講者名・テーマ名・証明番号・印刷ボタン・X 共有リンクを表示する", async () => {
    const html = await render("31");

    expect(fetchMyCertificateById).toHaveBeenCalledWith(2, 31);
    expect(html.replace(/<[^>]+>/g, "")).toContain("山田 太郎殿");
    expect(html).toContain("GAS 学習（基礎編）");
    expect(html).toContain("SS-202610-ABC123");
    expect(html).toContain("印刷 / PDF で保存");
    expect(html).toContain("https://twitter.com/intent/tweet?");
    expect(html).toContain("@page { size: A4 landscape; margin: 0; }");
  });

  it("テーマ名に関係なく、すべての修了証にシンラビを表示する", async () => {
    expect(await render("31")).toContain("お祝いするシンラビ");

    vi.mocked(fetchMyCertificateById).mockResolvedValue({
      data: { ...certificate, theme_name: "シンラビのWeb開発講座" },
      error: null,
    });
    expect(await render("31")).toContain("お祝いするシンラビ");
  });

  it("テーマカラーがあれば、その色から作った額縁の色で描く", async () => {
    vi.mocked(fetchCertificateThemeColor).mockResolvedValue("#3B77D8");

    const html = await render("31");

    expect(fetchCertificateThemeColor).toHaveBeenCalledWith(5);
    expect(html).toContain(`border-color:${buildCertificateThemeColors("#3B77D8")?.frame}`);
  });

  it("テーマカラーが無ければ、theme_id の色から作った額縁の色で描く", async () => {
    const html = await render("31");

    expect(html).toContain(`border-color:${resolveCertificateColors(5, null).frame}`);
  });

  it("「殿」は名前の最後の1文字と同じ行に置く（「殿」だけが改行されない）", async () => {
    expect(await render("31")).toMatch(
      /<span class="whitespace-nowrap">郎<span[^>]*>殿<\/span><\/span>/
    );
  });

  it("発行日は年月日の形（JST）で印字する", async () => {
    expect(await render("31")).toContain("2026年10月4日");
  });

  it("右上にサービスのロゴを表示する", async () => {
    expect(await render("31")).toContain('alt="Sinlab Study"');
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
