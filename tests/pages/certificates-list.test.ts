import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/services/api/learning-server");

import CertificatesPage from "@/app/(authenticated)/certificates/page";
import {
  fetchMyCertificates,
  issueMissingCertificates,
} from "@/app/services/api/certificates-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const summary = (id: number, completed: number) => ({
  theme: { id, name: `テーマ${id}` },
  totalContents: 2,
  completedContents: completed,
});
const certificate = (themeId: number) => ({
  id: 10 + themeId,
  user_id: 2,
  theme_id: themeId,
  certificate_no: "SS-202610-ABC123",
  recipient_name: "山田",
  theme_name: `テーマ${themeId}`,
  issued_at: "2026-10-04T00:00:00Z",
  created_at: "2026-10-04T00:00:00Z",
});

const render = async () => renderToStaticMarkup(await CertificatesPage());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "a" },
    userId: 2,
    userStatus: "active",
    userRole: "member",
  } as never);
  vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
    data: [summary(1, 2), summary(2, 1)] as never,
    error: null,
  });
  vi.mocked(fetchMyCertificates).mockResolvedValue({ data: [], error: null });
  vi.mocked(issueMissingCertificates).mockResolvedValue([]);
});

describe("/certificates の遡及発行", () => {
  it("完了済みで未発行のテーマの判定に、取得済みの集計と発行済みテーマ ID を渡す", async () => {
    vi.mocked(fetchMyCertificates).mockResolvedValue({ data: [certificate(2)], error: null });

    await render();

    expect(issueMissingCertificates).toHaveBeenCalledWith({
      userId: 2,
      userStatus: "active",
      userRole: "member",
      summaries: [summary(1, 2), summary(2, 1)],
      issuedThemeIds: new Set([2]),
    });
  });

  it("発行があったときは一覧を取り直し、発行済みとして表示する", async () => {
    vi.mocked(fetchMyCertificates)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [certificate(1)], error: null });
    vi.mocked(issueMissingCertificates).mockResolvedValue([
      { id: 11, certificate_no: "SS-202610-ABC123", theme_name: "テーマ1" },
    ]);

    const html = await render();

    expect(fetchMyCertificates).toHaveBeenCalledTimes(2);
    expect(html).toContain('href="/certificates/11"');
    expect(html).not.toContain("修了すると発行されます（2 / 2）");
  });

  it("発行が無ければ取り直さない。一覧を読めなかったときは遡及発行もしない", async () => {
    await render();
    expect(fetchMyCertificates).toHaveBeenCalledTimes(1);

    vi.mocked(fetchMyCertificates).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });
    vi.mocked(issueMissingCertificates).mockClear();
    await render();
    expect(issueMissingCertificates).not.toHaveBeenCalled();
  });

  it("一覧の取得に失敗したときは「まだ修了証はありません」ではなくエラーを表示する", async () => {
    vi.mocked(fetchMyCertificates).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });

    const html = await render();

    expect(html).toContain("修了証の取得に失敗しました");
    expect(html).not.toContain("まだ修了証はありません");
  });

  it("対象外（trial）は / へリダイレクトし、何も発行しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "a" },
      userId: 2,
      userStatus: "trial",
      userRole: "member",
    } as never);

    await expect(render()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(issueMissingCertificates).not.toHaveBeenCalled();
  });
});
