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
    // Reference check and deletion are batched into one call regardless of key count (#246).
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
    expect(mockClient.from).toHaveBeenCalledTimes(2);
    expect(mockClient.from.mock.results[0].value.select).toHaveBeenCalledWith(
      "week_id, pdf_url, grading_rubric, content_type"
    );
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
    // The failed chunk (first 100) isn't deleted; only the remaining chunks are.
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(keys.slice(100));
  });
});

describe("updateContent / createContent の採点基準（#305）", () => {
  const input = { requirements: [{ key: "r1", name: "A", description: "a" }] };

  const updatePayload = (mockClient: ReturnType<typeof mockAdminWithStorage>["mockClient"]) =>
    mockClient.from.mock.results.at(-1)?.value.update.mock.calls[0][0];

  it("保存済みの採点基準と比べて version を決める（変更があれば +1）", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: {
                version: 2,
                requirements: [{ key: "r1", name: "旧名", description: "a" }],
              },
            },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input });

    expect(result.error).toBeNull();
    expect(updatePayload(mockClient).grading_rubric).toEqual({
      version: 3,
      requirements: input.requirements,
      max_key_number: 1,
    });
  });

  it("画面を開いた版が保存済みと違うときは SELECT だけで競合にし、書き込まない", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: {
                version: 2,
                requirements: [{ key: "r1", name: "旧名", description: "a" }],
              },
            },
            error: null,
          },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input, loadedRubricVersion: 1 });

    expect(result).toEqual({ error: null, storageRemoved: true, conflict: true });
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from.mock.results[0].value.update).not.toHaveBeenCalled();
  });

  it("画面を開いた版が保存済みと一致すれば書き込む", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: {
                version: 2,
                requirements: [{ key: "r1", name: "旧名", description: "a" }],
              },
            },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input, loadedRubricVersion: 2 });

    expect(result.error).toBeNull();
    expect(result.gradingRubricVersion).toBe(3);
    expect(updatePayload(mockClient).grading_rubric.version).toBe(3);
  });

  it("非演習から演習へ種別を変える更新では、同じリクエストの採点基準を version 1 で保存する", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: { week_id: 3, pdf_url: null, content_type: "video", grading_rubric: null },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    await updateContent(1, { content_type: "exercise", gradingRubric: input });

    expect(updatePayload(mockClient).grading_rubric).toEqual({
      version: 1,
      requirements: input.requirements,
      max_key_number: 1,
    });
  });

  it("内容が同じなら version を据え置く", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: { version: 2, ...input },
            },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    await updateContent(1, { gradingRubric: input });

    expect(updatePayload(mockClient).grading_rubric.version).toBe(2);
  });

  it("未設定のコンテンツには version 1 で保存する", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: { week_id: 3, pdf_url: null, content_type: "exercise", grading_rubric: null },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    await updateContent(1, { gradingRubric: input });

    expect(updatePayload(mockClient).grading_rubric.version).toBe(1);
  });

  it("保存済みの種別が演習以外なら、種別を変えない更新でも採点基準は付けない", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: { week_id: 3, pdf_url: null, content_type: "video", grading_rubric: null },
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });

    await updateContent(1, { gradingRubric: input });

    expect(updatePayload(mockClient).grading_rubric).toBeNull();
  });

  it("現在値を取得できなければ version を決められないので更新しない", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: { learning_contents: [{ data: null, error: dbError }] },
    });

    const result = await updateContent(1, { gradingRubric: input });

    expect(result.error).toEqual(dbError);
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it("gradingRubric: null は読んだ version に一致する行だけ採点基準を消す", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: { version: 4, ...input },
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: null });
    expect(result.gradingRubricVersion).toBeNull();

    expect(mockClient.from).toHaveBeenCalledTimes(2);
    const rubricUpdate = mockClient.from.mock.results[1]?.value;
    expect(rubricUpdate.update.mock.calls[0][0].grading_rubric).toBeNull();
    expect(rubricUpdate.eq).toHaveBeenCalledWith("grading_rubric->>version", "4");
  });

  it("採点基準の更新が0行なら表示順を動かさず競合を返す", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: { version: 2, ...input },
            },
            error: null,
          },
          { data: [], error: null },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input, insertAfterId: 9 });

    expect(result.conflict).toBe(true);
    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });

  it("exercise 以外へ種別変更すると採点基準を破棄する", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: { version: 2, ...input },
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });

    await updateContent(1, { content_type: "video", gradingRubric: input });

    expect(updatePayload(mockClient).grading_rubric).toBeNull();
    expect(updatePayload(mockClient).content_type).toBe("video");
  });

  it("zod で読めない採点基準でも version で一致させ、NULL とは扱わない", async () => {
    const broken = {
      version: 2,
      requirements: [
        { key: "r1", name: "A", description: "a" },
        { key: "r1", name: "B", description: "b" },
      ],
    };
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: { week_id: 3, pdf_url: null, content_type: "exercise", grading_rubric: broken },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input });

    expect(result.error).toBeNull();
    expect(result.conflict).toBeUndefined();
    const rubricUpdate = mockClient.from.mock.results[1]?.value;
    expect(rubricUpdate.eq).toHaveBeenCalledWith("grading_rubric->>version", "2");
    expect(rubricUpdate.is).not.toHaveBeenCalledWith("grading_rubric", null);
    expect(rubricUpdate.update.mock.calls[0][0].grading_rubric.version).toBe(3);
  });

  it("採点基準を書いたあと再採番が失敗したら種別と基準を戻す", async () => {
    const storedRubric = { version: 2, ...input, max_key_number: 1 };
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: storedRubric,
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
          { data: null, error: dbError },
        ],
      },
    });

    const result = await updateContent(1, { gradingRubric: input, insertAfterId: 9 });

    expect(result.error).toEqual(dbError);
    const restore = mockClient.from.mock.results.at(-1)?.value.update.mock.calls[0][0];
    expect(restore).toEqual({ grading_rubric: storedRubric, content_type: "exercise" });
  });

  it("挿入位置が不正なら書いた採点基準を戻してから例外を伝える", async () => {
    const storedRubric = { version: 2, ...input, max_key_number: 1 };
    const { mockClient } = mockAdminWithStorage({
      tableResults: {
        learning_contents: [
          {
            data: {
              week_id: 3,
              pdf_url: null,
              content_type: "exercise",
              grading_rubric: storedRubric,
            },
            error: null,
          },
          { data: [{ id: 1 }], error: null },
          { data: [], error: null },
        ],
      },
    });

    await expect(
      updateContent(1, {
        gradingRubric: { requirements: [{ key: "r2", name: "B", description: "b" }] },
        insertAfterId: 999,
      })
    ).rejects.toThrow();

    const restore = mockClient.from.mock.results.at(-1)?.value.update.mock.calls[0][0];
    expect(restore).toEqual({ grading_rubric: storedRubric, content_type: "exercise" });
  });

  it("gradingRubric 未指定なら採点基準の列に触れない", async () => {
    const { mockClient } = mockAdminWithStorage({
      tableResults: { learning_contents: [{ data: null, error: null }] },
    });

    await updateContent(1, { title: "改題" });

    expect("grading_rubric" in updatePayload(mockClient)).toBe(false);
  });
});
