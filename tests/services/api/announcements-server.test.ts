import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type QueryResult } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/auth/server-auth");

import {
  fetchAnnouncementsWithReadState,
  fetchVisibleAnnouncement,
  markAnnouncementRead,
  resolveAnnouncementViewer,
  updateAnnouncement,
} from "@/app/services/api/announcements-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

function mockClient(tableResults: Record<string, QueryResult | QueryResult[]>) {
  const client = createMockSupabaseClient({ tableResults });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
  return client;
}

function buildersOf(client: ReturnType<typeof mockClient>, table: string) {
  return client.from.mock.calls
    .map(([name], index) => ({ name, builder: client.from.mock.results[index].value }))
    .filter(({ name }) => name === table)
    .map(({ builder }) => builder);
}

const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `お知らせ${id}`,
  published_at: "2026-10-01T00:00:00Z",
  target_statuses: ["active", "trial"],
  target_membership_types: null,
  ...overrides,
});

const trialViewer = { userId: 7, status: "trial" as const, membershipType: null };
const generalViewer = { userId: 8, status: "active" as const, membershipType: "general" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("受講生向けの取得（二層防御のアプリ層）", () => {
  it("公開済み・未削除・対象ステータスで絞り、会員種別の無いユーザーは全種別のお知らせだけにする", async () => {
    const client = mockClient({
      announcements: { data: [row(1)], error: null },
      announcement_reads: { data: [], error: null },
    });

    await fetchAnnouncementsWithReadState(trialViewer);

    const [query] = buildersOf(client, "announcements");
    expect(query.not).toHaveBeenCalledWith("published_at", "is", null);
    expect(query.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(query.contains).toHaveBeenCalledWith("target_statuses", ["trial"]);
    expect(query.or).toHaveBeenCalledWith("target_membership_types.is.null");
  });

  it("会員種別のあるユーザーは、全種別か自分の種別を含むお知らせに絞る", async () => {
    const client = mockClient({
      announcements: { data: [], error: null },
      announcement_reads: { data: [], error: null },
    });

    await fetchAnnouncementsWithReadState(generalViewer);

    const [query] = buildersOf(client, "announcements");
    expect(query.or).toHaveBeenCalledWith(
      "target_membership_types.is.null,target_membership_types.cs.{general}"
    );
  });

  it("DB が対象外の行を返しても（admin の RLS 等）アプリ層で除き、埋め込みの既読から既読状態を付ける", async () => {
    const client = mockClient({
      announcements: {
        data: [
          row(1, { announcement_reads: [] }),
          row(2, { target_statuses: ["active"], announcement_reads: [] }),
          row(3, { target_membership_types: ["general"], announcement_reads: [] }),
          row(4, { announcement_reads: [{ announcement_id: 4 }] }),
        ],
        error: null,
      },
    });

    const { data } = await fetchAnnouncementsWithReadState(trialViewer);

    expect(data?.map((item) => [item.id, item.isRead])).toEqual([
      [1, false],
      [4, true],
    ]);
    expect(data?.[0]).not.toHaveProperty("announcement_reads");
    // Read status embeds only the user's own row, not a separate query.
    const [query] = buildersOf(client, "announcements");
    expect(query.eq).toHaveBeenCalledWith("announcement_reads.user_id", 7);
    expect(buildersOf(client, "announcement_reads")).toHaveLength(0);
  });

  it("一覧はページ単位で取得し、総件数を返す", async () => {
    const client = mockClient({
      announcements: { data: [row(21, { announcement_reads: [] })], error: null, count: 21 },
    });

    const { data, count } = await fetchAnnouncementsWithReadState(trialViewer, {
      page: 2,
      pageSize: 20,
    });

    const [query] = buildersOf(client, "announcements");
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(query.limit).not.toHaveBeenCalled();
    expect(count).toBe(21);
    expect(data).toHaveLength(1);
  });

  it("1件の取得でも対象外なら null（存在を明かさない）", async () => {
    mockClient({
      announcements: { data: row(2, { target_statuses: ["active"], body: "b" }), error: null },
    });

    const { data } = await fetchVisibleAnnouncement(trialViewer, 2);

    expect(data).toBeNull();
  });
});

describe("resolveAnnouncementViewer", () => {
  it("却下・不明のユーザーは閲覧者にしない", async () => {
    mockClient({ users: { data: { membership_type: null }, error: null } });

    expect(await resolveAnnouncementViewer({ userId: 1, userStatus: "rejected" })).toBeNull();
    expect(await resolveAnnouncementViewer({ userId: null, userStatus: "active" })).toBeNull();
  });

  it("本人の会員種別を読んで閲覧者にする", async () => {
    mockClient({ users: { data: { membership_type: "general" }, error: null } });

    expect(await resolveAnnouncementViewer({ userId: 8, userStatus: "active" })).toEqual(
      generalViewer
    );
  });
});

describe("markAnnouncementRead", () => {
  it("既に既読（主キー違反）でも成功扱い", async () => {
    mockClient({
      announcement_reads: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    expect(await markAnnouncementRead(7, 1)).toEqual({ error: null });
  });

  it("それ以外の DB エラー（RLS 拒否を含む）は返す", async () => {
    mockClient({
      announcement_reads: { data: null, error: { code: "42501", message: "rls" } },
    });
    expect((await markAnnouncementRead(7, 1)).error).not.toBeNull();
  });
});

describe("updateAnnouncement の公開日時", () => {
  const input = {
    title: "t",
    body: "b",
    target_statuses: ["active" as const],
    target_membership_types: null,
    send_email: true,
    is_published: true,
  };

  it("公開済みのまま更新するときは最初の公開日時を保つ", async () => {
    const client = mockClient({
      announcements: [
        { data: { id: 1, published_at: "2026-10-01T00:00:00Z" }, error: null },
        { data: [{ id: 1 }], error: null },
      ],
    });

    await updateAnnouncement(1, input);

    const [, update] = buildersOf(client, "announcements");
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ published_at: "2026-10-01T00:00:00Z" })
    );
  });

  it("下書きを公開すると公開日時を記録し、非公開にすると消す", async () => {
    const client = mockClient({
      announcements: [
        { data: { id: 1, published_at: null }, error: null },
        { data: [{ id: 1 }], error: null },
        { data: { id: 1, published_at: "2026-10-01T00:00:00Z" }, error: null },
        { data: [{ id: 1 }], error: null },
      ],
    });

    await updateAnnouncement(1, input);
    await updateAnnouncement(1, { ...input, is_published: false });

    const [, publish, , unpublish] = buildersOf(client, "announcements");
    expect(publish.update).toHaveBeenCalledWith(
      expect.objectContaining({ published_at: expect.any(String) })
    );
    expect(unpublish.update).toHaveBeenCalledWith(expect.objectContaining({ published_at: null }));
  });

  it("削除済み・存在しないお知らせは notFound", async () => {
    mockClient({ announcements: { data: null, error: null } });
    expect(await updateAnnouncement(1, input)).toEqual({ error: null, notFound: true });
  });
});

describe("updateAnnouncement の対象変更とメールの一斉送信", () => {
  const sent = {
    id: 1,
    published_at: "2026-10-01T00:00:00Z",
    target_statuses: ["active", "trial"],
    target_membership_types: null,
    email_sent_at: "2026-10-02T00:00:00Z",
  };
  const input = {
    title: "t",
    body: "b",
    target_statuses: ["trial" as const, "active" as const],
    target_membership_types: null,
    send_email: true,
    is_published: true,
  };

  async function updateWith(
    overrides: Partial<typeof input> | Record<string, unknown>,
    current: Record<string, unknown> = sent
  ) {
    const client = mockClient({
      announcements: [
        { data: current, error: null },
        { data: [{ id: 1 }], error: null },
      ],
    });
    await updateAnnouncement(1, { ...input, ...overrides } as typeof input);
    const [, update] = buildersOf(client, "announcements");
    return update.update.mock.calls[0][0] as Record<string, unknown>;
  }

  it("対象が変わらなければ（並び順の違いだけなら）送信済みの記録を残す", async () => {
    expect(await updateWith({ title: "題名だけ直す" })).not.toHaveProperty("email_sent_at");
  });

  it("対象ステータスを変えたら未完了に戻し、次のバッチで未送信の対象者に送る", async () => {
    expect(await updateWith({ target_statuses: ["active"] })).toMatchObject({
      email_sent_at: null,
    });
  });

  it("会員種別の指定を変えたら未完了に戻す", async () => {
    const current = { ...sent, target_statuses: ["active"], target_membership_types: ["general"] };
    expect(
      await updateWith(
        { target_statuses: ["active"], target_membership_types: ["general", "community"] },
        current
      )
    ).toMatchObject({ email_sent_at: null });
    expect(
      await updateWith({ target_statuses: ["active"], target_membership_types: null }, current)
    ).toMatchObject({ email_sent_at: null });
  });
});
