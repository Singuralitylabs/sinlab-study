import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  bulkUpdateContents,
  deleteContent,
  deletePhase,
  deleteTheme,
  deleteWeek,
  updateContent,
} from "@/app/services/api/admin-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

function mockAdminWithStorage({
  tableResults,
  removeResult = { data: null, error: null },
}: {
  tableResults?: Record<
    string,
    { data: unknown; error: unknown } | { data: unknown; error: unknown }[]
  >;
  removeResult?: { data: unknown; error: unknown };
} = {}) {
  const mockClient = createMockSupabaseClient({ tableResults });
  const remove = vi.fn().mockResolvedValue(removeResult);
  const storageFrom = vi.fn().mockReturnValue({ remove });
  (mockClient as unknown as { storage: unknown }).storage = { from: storageFrom };
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);
  return { mockClient, remove, storageFrom };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteContent の slides 削除（issue #145）", () => {
  it("他に参照がなければ Storage を削除し storageRemoved: true を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("同じ pdf_url を参照する生きたコンテンツが残っていれば Storage を削除しない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [{ id: 2 }], error: null },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("Storage 削除に失敗してもDBの論理削除は成立し storageRemoved: false を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
      removeResult: { data: null, error: { message: "storage boom" } },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: false });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("pdf_url がなければ Storage に触れない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: null }], error: null },
          { data: null, error: null },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("bulkUpdateContents の slides 削除（issue #145）", () => {
  it("一括削除では対象の pdf_url を削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }, { pdf_url: "gas/slide-02.pdf" }], error: null },
          { data: [{ id: 1 }, { id: 2 }], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
    });

    const result = await bulkUpdateContents([1, 2], { is_deleted: true });

    expect(result.error).toBeNull();
    expect(result.updated).toBe(2);
    expect(result.storageRemoved).toBe(true);
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
    expect(remove).toHaveBeenCalledWith(["gas/slide-02.pdf"]);
  });

  it("削除以外の一括更新では Storage に触れない", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: { data: [{ id: 1 }], error: null },
      },
    });

    const result = await bulkUpdateContents([1], { is_published: true });

    expect(result).toEqual({ error: null, updated: 1, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });
});

describe("deleteWeek / deletePhase / deleteTheme の slides 削除（issue #145）", () => {
  it("週削除では配下の pdf_url を削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
        learning_weeks: { data: null, error: null },
      },
    });

    const result = await deleteWeek(1);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("フェーズ削除では配下の pdf_url を削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_weeks: { data: [{ id: 10 }], error: null },
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
        learning_phases: { data: null, error: null },
      },
    });

    const result = await deletePhase(5);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("テーマ削除では配下の pdf_url を削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_phases: { data: [{ id: 7 }], error: null },
        learning_weeks: [
          { data: [{ id: 10 }], error: null },
          { data: null, error: null },
        ],
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
        learning_themes: { data: null, error: null },
      },
    });

    const result = await deleteTheme(3);

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("DBエラー時は Storage に触れず storageRemoved: true でエラーを返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: dbError },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result.error).toEqual(dbError);
    expect(result.storageRemoved).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("updateContent の pdf_url 差し替え（issue #145）", () => {
  it("旧キーが他から参照されていなければ削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
    });

    const result = await updateContent(1, { pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("同一キーへの差し替え（upsert上書き）では削除しない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { pdf_url: "gas/slide-01.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("旧キーが他から参照されていれば削除しない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
          { data: [{ id: 2 }], error: null },
        ],
      },
    });

    const result = await updateContent(1, { pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("pdf_url を変更しない更新では Storage に触れない", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: { learning_contents: { data: null, error: null } },
    });

    const result = await updateContent(10, { title: "タイトル変更のみ" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("Storage 削除に失敗しても更新は成立し storageRemoved: false を返す", async () => {
    mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
      removeResult: { data: null, error: { message: "storage boom" } },
    });

    const result = await updateContent(1, { pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: false });
  });
});

describe("レビュー指摘の回帰テスト", () => {
  it("pdf_url 取得に失敗した単体削除では Storage に触れず storageRemoved: false を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: null, error: dbError },
          { data: null, error: null },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("pdf_url 取得に失敗した週削除では Storage に触れず storageRemoved: false を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: null, error: dbError },
          { data: null, error: null },
        ],
        learning_weeks: { data: null, error: null },
      },
    });

    const result = await deleteWeek(1);

    expect(result).toEqual({ error: null, storageRemoved: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("週の論理削除に失敗した場合は Storage 削除を行わない（DB失敗・PDF削除済みの不整合を作らない）", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
        ],
        learning_weeks: { data: null, error: dbError },
      },
    });

    const result = await deleteWeek(1);

    expect(result.error).toEqual(dbError);
    expect(result.storageRemoved).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("フェーズの論理削除に失敗した場合は Storage 削除を行わない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_weeks: [
          { data: [{ id: 10 }], error: null },
          { data: null, error: null },
        ],
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
        ],
        learning_phases: { data: null, error: dbError },
      },
    });

    const result = await deletePhase(5);

    expect(result.error).toEqual(dbError);
    expect(result.storageRemoved).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("一括削除の pdf_url 取得に失敗した場合は storageRemoved: false を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: null, error: dbError },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });

    const result = await bulkUpdateContents([1], { is_deleted: true });

    expect(result.error).toBeNull();
    expect(result.updated).toBe(1);
    expect(result.storageRemoved).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});
