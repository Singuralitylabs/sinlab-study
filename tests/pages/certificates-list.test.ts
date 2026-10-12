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

const NOTHING = { issued: [], blockedByMissingName: false };

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
  vi.mocked(issueMissingCertificates).mockResolvedValue(NOTHING);
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
    vi.mocked(issueMissingCertificates).mockResolvedValue({
      issued: [{ id: 11, theme_id: 1, certificate_no: "SS-202610-ABC123", theme_name: "テーマ1" }],
      blockedByMissingName: false,
    });

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
    // Nothing was attempted, so no theme may be reported as "could not be issued".
    expect(html).not.toContain("修了証を発行できませんでした");
    expect(html).not.toContain("未発行のテーマ");
  });

  it("氏名未設定で発行できないときは、完了済みのテーマに「修了すると」ではなく問い合わせを案内する", async () => {
    vi.mocked(issueMissingCertificates).mockResolvedValue({
      issued: [],
      blockedByMissingName: true,
    });

    const html = await render();

    expect(html).toContain("氏名が未設定のため発行できません");
    // Theme 2 (1/2) is not completed yet, so it keeps the normal "when you complete" message.
    expect(html).toContain("修了すると発行されます（1 / 2）");
    expect(html).not.toContain("修了すると発行されます（2 / 2）");
  });

  it("氏名以外の理由で発行できなかった完了済みのテーマも、「修了すると」とは案内しない", async () => {
    const html = await render();

    expect(html).toContain("修了証を発行できませんでした");
    expect(html).not.toContain("修了すると発行されます（2 / 2）");
    expect(html).toContain("修了すると発行されます（1 / 2）");
  });

  it("発行後の再取得に失敗しても、いま発行したテーマを「発行できませんでした」にしない", async () => {
    vi.mocked(fetchMyCertificates)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "x" } as never });
    vi.mocked(issueMissingCertificates).mockResolvedValue({
      issued: [{ id: 11, theme_id: 1, certificate_no: "SS-202610-ABC123", theme_name: "テーマ1" }],
      blockedByMissingName: false,
    });

    const html = await render();

    expect(fetchMyCertificates).toHaveBeenCalledTimes(2);
    // Theme 1 (2/2) was just issued, so only theme 2 (1/2) may remain unissued.
    expect(html).not.toContain("修了証を発行できませんでした");
    // The failed re-read shows the error card, not a stale empty list.
    expect(html).toContain("修了証の取得に失敗しました");
    expect(html).not.toContain("まだ修了証はありません");
    expect(html).not.toContain("修了すると発行されます（2 / 2）");
    expect(html).toContain("修了すると発行されます（1 / 2）");
  });

  it("進捗の集計に失敗したときは、未発行のテーマが消えたように見せずエラーを表示する", async () => {
    vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });

    const html = await render();

    expect(html).toContain("学習の進捗の取得に失敗しました");
    expect(html).not.toContain("修了すると発行されます");
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
