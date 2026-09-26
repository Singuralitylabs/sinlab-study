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
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
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
        ],
      },
    });

    const result = await bulkUpdateContents([1, 2], { is_deleted: true });

    expect(result.error).toBeNull();
    expect(result.updated).toBe(2);
    expect(result.storageRemoved).toBe(true);
    // 参照確認・削除ともキー数に依らず1回にまとめる（issue #246）
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf", "gas/slide-02.pdf"]);
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
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
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

  it("旧 pdf_url の事前取得に失敗しても更新は続行し storageRemoved: false を返す", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: null, error: dbError },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: false });
    expect(remove).not.toHaveBeenCalled();
    // 事前取得＋本体UPDATEの2回のみで、参照確認には進まない
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });
});

describe("スライド孤児削除の往復削減（issue #246）", () => {
  it("生きた参照の確認はキー数に依らず1クエリ（in + is_deleted = false）で行う", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: [
              { pdf_url: "gas/slide-01.pdf" },
              { pdf_url: "gas/slide-02.pdf" },
              { pdf_url: "gas/slide-03.pdf" },
            ],
            error: null,
          },
          { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null },
          { data: [], error: null },
        ],
      },
    });

    await bulkUpdateContents([1, 2, 3], { is_deleted: true });

    // pdf_url 取得・一括UPDATE・参照確認の3回のみ
    expect(mockClient.from).toHaveBeenCalledTimes(3);
    const referenceQuery = mockClient.from.mock.results[2].value;
    expect(referenceQuery.select).toHaveBeenCalledWith("pdf_url");
    expect(referenceQuery.in).toHaveBeenCalledWith("pdf_url", [
      "gas/slide-01.pdf",
      "gas/slide-02.pdf",
      "gas/slide-03.pdf",
    ]);
    expect(referenceQuery.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("他のコンテンツが参照中のキーだけを除いて、残りをまとめて削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }, { pdf_url: "gas/slide-02.pdf" }], error: null },
          { data: [{ id: 1 }, { id: 2 }], error: null },
          { data: [{ pdf_url: "gas/slide-02.pdf" }], error: null },
        ],
      },
    });

    const result = await bulkUpdateContents([1, 2], { is_deleted: true });

    expect(result.storageRemoved).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("同じキーを複数行が指していても重複排除して1回だけ渡す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }, { pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: [{ id: 1 }, { id: 2 }], error: null },
          { data: [], error: null },
        ],
      },
    });

    await bulkUpdateContents([1, 2], { is_deleted: true });

    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("参照確認に失敗した場合は削除を試みず storageRemoved: false を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: null, error: dbError },
        ],
      },
    });

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("Storage 呼び出しが例外を投げても storageRemoved: false で DB 操作の成功を返す", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: [{ pdf_url: "gas/slide-01.pdf" }], error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
    });
    remove.mockRejectedValue(new Error("network down"));

    const result = await deleteContent(1);

    expect(result).toEqual({ error: null, storageRemoved: false });
  });
});

describe("updateContent の現在値取得の一本化（issue #246）", () => {
  it("PUT と同じく week_id と pdf_url を渡すタイトル修正では、現在値の取得は1回で Storage に触れない", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { week_id: 3, pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, {
      title: "タイトル修正",
      week_id: 3,
      pdf_url: "gas/slide-01.pdf",
    });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
    // 現在値取得＋本体UPDATEの2回のみ
    expect(mockClient.from).toHaveBeenCalledTimes(2);
    expect(mockClient.from.mock.results[0].value.select).toHaveBeenCalledWith("week_id, pdf_url");
  });

  it("非スライド（pdf_url: null）のタイトル修正でも現在値の取得は1回で Storage に触れない", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { week_id: 3, pdf_url: null }, error: null },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { title: "タイトル修正", week_id: 3, pdf_url: null });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("正規化後のキーが同じ（旧形式の保存値）なら削除しない", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: "/storage/v1/object/public/slides/gas/slide-01.pdf",
            },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { week_id: 3, pdf_url: "gas/slide-01.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
  });

  it("week_id とともに pdf_url を差し替えたときは旧キーを削除する", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: { week_id: 3, pdf_url: "gas/slide-01.pdf" }, error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
    });

    const result = await updateContent(1, { week_id: 3, pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: null, storageRemoved: true });
    expect(remove).toHaveBeenCalledWith(["gas/slide-01.pdf"]);
  });

  it("週の判定に現在値が必要なときに取得が失敗したら、更新せずエラーを返す", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [{ data: null, error: dbError }],
      },
    });

    const result = await updateContent(1, { week_id: 3, pdf_url: "gas/slide-02.pdf" });

    expect(result).toEqual({ error: dbError, storageRemoved: true });
    expect(remove).not.toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });
});

describe("スライド孤児削除のチャンク分割（PR #260 レビュー対応）", () => {
  const keys = Array.from(
    { length: 150 },
    (_, i) => `big/slide-${String(i + 1).padStart(3, "0")}.pdf`
  );
  const ids = keys.map((_, i) => i + 1);

  it("100件を超えるキーは100件ごとに参照確認・削除する", async () => {
    const { mockClient, remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: keys.map((pdf_url) => ({ pdf_url })), error: null },
          { data: ids.map((id) => ({ id })), error: null },
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
    });

    const result = await bulkUpdateContents(ids, { is_deleted: true });

    expect(result.storageRemoved).toBe(true);
    // pdf_url 取得・一括UPDATE・参照確認2チャンク
    expect(mockClient.from).toHaveBeenCalledTimes(4);
    expect(mockClient.from.mock.results[2].value.in).toHaveBeenCalledWith(
      "pdf_url",
      keys.slice(0, 100)
    );
    expect(mockClient.from.mock.results[3].value.in).toHaveBeenCalledWith(
      "pdf_url",
      keys.slice(100)
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, keys.slice(0, 100));
    expect(remove).toHaveBeenNthCalledWith(2, keys.slice(100));
  });

  it("あるチャンクの参照確認に失敗しても他のチャンクは削除し、全体は storageRemoved: false", async () => {
    const { remove } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          { data: keys.map((pdf_url) => ({ pdf_url })), error: null },
          { data: ids.map((id) => ({ id })), error: null },
          { data: null, error: dbError },
          { data: [], error: null },
        ],
      },
    });

    const result = await bulkUpdateContents(ids, { is_deleted: true });

    expect(result.storageRemoved).toBe(false);
    // 失敗したチャンク（先頭100件）は削除せず、残りのチャンクだけ削除する
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(keys.slice(100));
  });
});
