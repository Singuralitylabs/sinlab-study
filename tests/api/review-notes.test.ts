import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");

import { DELETE, PUT } from "@/app/api/review-notes/route";
import { REVIEW_NOTE_MEMO_MAX_LENGTH } from "@/app/constants/review-list";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const putRequest = (body: unknown) =>
  new Request("http://localhost/api/review-notes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const deleteRequest = (body: unknown) =>
  new Request("http://localhost/api/review-notes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
});

describe("PUT /api/review-notes - 認可", () => {
  it("未認証は401を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await PUT(putRequest({ contentId: 1, requirementKey: "r1", memo: "a" }) as never);

    expect(res.status).toBe(401);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejected ユーザーは403を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await PUT(putRequest({ contentId: 1, requirementKey: "r1", memo: "a" }) as never);

    expect(res.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("対象コンテンツが不可視の場合は403", async () => {
    vi.mocked(isContentVisible).mockResolvedValue(false);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(createMockSupabaseClient() as never);

    const res = await PUT(putRequest({ contentId: 1, requirementKey: "r1", memo: "a" }) as never);

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/review-notes - バリデーション", () => {
  it("memo が 500 文字を超えると 400（切らない）", async () => {
    const res = await PUT(
      putRequest({
        contentId: 1,
        requirementKey: "r1",
        memo: "あ".repeat(REVIEW_NOTE_MEMO_MAX_LENGTH + 1),
      }) as never
    );

    expect(res.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("memo も understood も無いと 400", async () => {
    const res = await PUT(putRequest({ contentId: 1, requirementKey: "r1" }) as never);
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/review-notes - upsert", () => {
  it("既存行が無いときは INSERT し、認証ユーザーIDで書く", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        review_notes: [
          { data: null, error: null },
          {
            data: {
              id: 1,
              content_id: 1,
              requirement_key: "r1",
              memo: "メモ",
              understood_at: null,
              updated_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await PUT(
      putRequest({ contentId: 1, requirementKey: "r1", memo: "メモ" }) as never
    );

    expect(res.status).toBe(200);
    expect(client.from).toHaveBeenCalledWith("review_notes");
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    const insertBuilder = builders.find((b) => b.insert.mock.calls.length > 0);
    expect(insertBuilder?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 2,
        content_id: 1,
        requirement_key: "r1",
        memo: "メモ",
      })
    );
  });

  it("既存行があるときの再PUTは冪等に UPDATE する", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        review_notes: [
          { data: { id: 9, memo: "旧", understood_at: null }, error: null },
          {
            data: {
              id: 9,
              content_id: 1,
              requirement_key: "r1",
              memo: "新",
              understood_at: null,
              updated_at: "2026-01-02T00:00:00Z",
            },
            error: null,
          },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await PUT(putRequest({ contentId: 1, requirementKey: "r1", memo: "新" }) as never);

    expect(res.status).toBe(200);
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    const updateBuilder = builders.find((b) => b.update.mock.calls.length > 0);
    expect(updateBuilder?.update).toHaveBeenCalledWith({ memo: "新" });
    expect(updateBuilder?.eq).toHaveBeenCalledWith("user_id", 2);
  });

  it("他人の userId を送っても無視し、認証ユーザーで書く", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        review_notes: [
          { data: null, error: null },
          {
            data: {
              id: 1,
              content_id: 1,
              requirement_key: null,
              memo: "x",
              understood_at: null,
              updated_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await PUT(
      putRequest({
        contentId: 1,
        requirementKey: null,
        memo: "x",
        userId: 999,
      }) as never
    );

    expect(res.status).toBe(200);
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    const insertBuilder = builders.find((b) => b.insert.mock.calls.length > 0);
    expect(insertBuilder?.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 2 }));
    expect(insertBuilder?.insert.mock.calls[0][0].user_id).not.toBe(999);
  });

  it("INSERT が 23505 のときは既存行を再取得して UPDATE する", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        review_notes: [
          { data: null, error: null },
          { data: null, error: { code: "23505", message: "duplicate key" } },
          { data: { id: 9 }, error: null },
          {
            data: {
              id: 9,
              content_id: 1,
              requirement_key: "r1",
              memo: "競合後",
              understood_at: null,
              updated_at: "2026-01-02T00:00:00Z",
            },
            error: null,
          },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await PUT(
      putRequest({ contentId: 1, requirementKey: "r1", memo: "競合後" }) as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note.id).toBe(9);
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    expect(builders.some((b) => b.insert.mock.calls.length > 0)).toBe(true);
    expect(builders.some((b) => b.update.mock.calls.length > 0)).toBe(true);
  });
});

describe("DELETE /api/review-notes", () => {
  it("本人の行だけを削除する（user_id を認証値で絞る）", async () => {
    const deleteBuilder = createQueryBuilder({ data: null, error: null });
    const client = {
      from: vi.fn().mockReturnValue(deleteBuilder),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await DELETE(deleteRequest({ contentId: 1, requirementKey: "r1" }) as never);

    expect(res.status).toBe(200);
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("user_id", 2);
    expect(deleteBuilder.eq).toHaveBeenCalledWith("content_id", 1);
    expect(deleteBuilder.eq).toHaveBeenCalledWith("requirement_key", "r1");
  });
});
