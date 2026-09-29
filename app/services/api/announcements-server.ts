import type { PostgrestError } from "@supabase/supabase-js";
import { cache } from "react";
import { UNREAD_ANNOUNCEMENT_SCAN_LIMIT } from "@/app/constants/announcements";
import { ALLOWED_USER_STATUSES } from "@/app/constants/user";
import { isAnnouncementTarget } from "@/app/lib/announcement-target";
import type { AnnouncementInput } from "@/app/services/api/schemas";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { Announcement, UserStatusType } from "@/app/types";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * お知らせ（#254）の取得・更新。受講生向け・管理向けとも通常クライアント（RLS 適用）で行い、
 * service_role は使わない（メールの一斉送信の抽出だけが Cron の service_role 経路。
 * `email-digest-server.ts`）。
 *
 * 受講生向けは二層防御: RLS の SELECT ポリシーに加えて、アプリ層でも公開済み・未削除・
 * 対象ステータス・対象会員種別で絞る（admin / maintainer は RLS で全件見えるため、アプリ層の
 * 絞り込みが無いと受講生向け画面に下書きや非対象のお知らせが出てしまう）。
 */

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** 受講生向け画面で表示するお知らせ（一覧・ダッシュボードは本文を使わない） */
export type AnnouncementSummary = Pick<
  Announcement,
  "id" | "title" | "published_at" | "target_statuses" | "target_membership_types"
>;
export type AnnouncementDetail = AnnouncementSummary & Pick<Announcement, "body">;
export type AnnouncementWithReadState = AnnouncementSummary & { isRead: boolean };

/** お知らせを閲覧するユーザー（`getServerAuth()` の値と、本人の会員種別） */
export type AnnouncementViewer = {
  userId: number;
  status: UserStatusType;
  membershipType: string | null;
};

const SUMMARY_COLUMNS = "id, title, published_at, target_statuses, target_membership_types";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, body`;

/**
 * 閲覧者を組み立てる。お知らせを見られるのは active / trial のユーザーだけで、それ以外
 * （却下・不明）は null。会員種別は `getServerAuth()` が持たないため本人の行から読む
 * （RLS で本人の行は読める）。読めなければ null（種別指定のお知らせは見えない側に倒す）。
 */
export async function resolveAnnouncementViewer(auth: {
  userId: number | null;
  userStatus: UserStatusType | null;
}): Promise<AnnouncementViewer | null> {
  if (!auth.userId || !auth.userStatus || !ALLOWED_USER_STATUSES.includes(auth.userStatus)) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("membership_type")
    .eq("id", auth.userId)
    .maybeSingle();
  if (error) {
    console.error("お知らせの閲覧者の会員種別取得エラー:", error.message);
  }
  return {
    userId: auth.userId,
    status: auth.userStatus,
    membershipType: (data?.membership_type as string | null | undefined) ?? null,
  };
}

/**
 * 受講生向けのアプリ層の絞り込み（公開済み・未削除・対象ステータス・対象会員種別）を
 * PostgREST の会員種別条件にする。RLS と同じ条件で、admin / maintainer が受講生向け画面を
 * 開いたときも自分が対象のお知らせだけを返すようにする。会員種別が無い（お試しユーザー等）
 * ときは「全種別」のお知らせだけが対象。
 */
function membershipFilter(viewer: AnnouncementViewer): string {
  return viewer.membershipType
    ? `target_membership_types.is.null,target_membership_types.cs.{${viewer.membershipType}}`
    : "target_membership_types.is.null";
}

function onlyTargets<T extends AnnouncementSummary>(rows: T[], viewer: AnnouncementViewer): T[] {
  return rows.filter((row) =>
    isAnnouncementTarget(row, { status: viewer.status, membershipType: viewer.membershipType })
  );
}

async function fetchReadIds(
  supabase: ServerClient,
  userId: number,
  announcementIds: number[]
): Promise<Set<number> | null> {
  if (announcementIds.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("user_id", userId)
    .in("announcement_id", announcementIds);
  if (error) {
    console.error("お知らせの既読取得エラー:", error.message);
    return null;
  }
  return new Set((data ?? []).map((row: { announcement_id: number }) => row.announcement_id));
}

type SummaryWithReads = AnnouncementSummary & {
  announcement_reads: { announcement_id: number }[] | null;
};

/**
 * 自分が対象の公開済みお知らせを新しい順に、既読状態付きで返す。既読は `announcement_reads` を
 * 埋め込んで同じクエリで取る（本人の行だけ。RLS でも本人の行しか読めない）。
 *
 * - `{ limit }`: 新しい順に最大 `limit` 件（サイドナビの未読バッジ・ダッシュボード用）
 * - `{ page, pageSize }`: お知らせ一覧のページ（総件数 `count` も返す）
 */
export async function fetchAnnouncementsWithReadState(
  viewer: AnnouncementViewer,
  range: { limit: number } | { page: number; pageSize: number } = {
    limit: UNREAD_ANNOUNCEMENT_SCAN_LIMIT,
  }
): Promise<{
  data: AnnouncementWithReadState[] | null;
  count: number;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const query = supabase
    .from("announcements")
    .select(
      `${SUMMARY_COLUMNS}, announcement_reads(announcement_id)`,
      "page" in range ? { count: "exact" } : undefined
    )
    .not("published_at", "is", null)
    .eq("is_deleted", false)
    .contains("target_statuses", [viewer.status])
    .or(membershipFilter(viewer))
    .eq("announcement_reads.user_id", viewer.userId)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
  const { data, count, error } =
    "page" in range
      ? await query.range((range.page - 1) * range.pageSize, range.page * range.pageSize - 1)
      : await query.limit(range.limit);

  if (error) {
    console.error("お知らせ一覧取得エラー:", error.message);
    return { data: null, count: 0, error };
  }

  const rows = onlyTargets((data ?? []) as SummaryWithReads[], viewer);
  return {
    data: rows.map(({ announcement_reads, ...row }) => ({
      ...row,
      isRead: (announcement_reads ?? []).length > 0,
    })),
    count: count ?? rows.length,
    error,
  };
}

/** 既読か（読めなければ既読扱いにして、詳細画面で既読の記録をやり直さない） */
export async function isAnnouncementRead(
  viewer: AnnouncementViewer,
  announcementId: number
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const readIds = await fetchReadIds(supabase, viewer.userId, [announcementId]);
  return readIds === null || readIds.has(announcementId);
}

/**
 * リクエスト中の閲覧者（`getServerAuth()` から組み立てる）。レイアウト（サイドナビの未読
 * バッジ）・ダッシュボード・一覧で共有し、同じリクエストでの再取得を避ける（`React.cache()`）
 */
export const getAnnouncementViewer = cache(async (): Promise<AnnouncementViewer | null> => {
  const { userId, userStatus } = await getServerAuth();
  return resolveAnnouncementViewer({ userId, userStatus });
});

/**
 * リクエスト中の閲覧者が対象のお知らせ（既読状態付き、新しい順に最大
 * `UNREAD_ANNOUNCEMENT_SCAN_LIMIT` 件）。サイドナビの未読バッジとダッシュボード用。閲覧者が
 * 無ければ空。一覧画面はページングする `fetchAnnouncementsWithReadState()` を使う
 */
export const getViewerAnnouncements = cache(
  async (): Promise<{ data: AnnouncementWithReadState[] | null; error: PostgrestError | null }> => {
    const viewer = await getAnnouncementViewer();
    if (!viewer) {
      return { data: [], error: null };
    }
    const { data, error } = await fetchAnnouncementsWithReadState(viewer);
    return { data, error };
  }
);

/** サイドナビのバッジ用の未読件数。取得に失敗したら 0（レイアウトの表示を止めない） */
export async function fetchUnreadAnnouncementCount(): Promise<number> {
  try {
    const { data } = await getViewerAnnouncements();
    return (data ?? []).filter((row) => !row.isRead).length;
  } catch (error) {
    console.error("お知らせの未読件数の取得エラー:", error);
    return 0;
  }
}

/** 自分が対象の公開済みお知らせを1件返す（非対象・下書き・削除済み・存在しないIDは null） */
export async function fetchVisibleAnnouncement(
  viewer: AnnouncementViewer,
  id: number
): Promise<{ data: AnnouncementDetail | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .not("published_at", "is", null)
    .eq("is_deleted", false)
    .contains("target_statuses", [viewer.status])
    .or(membershipFilter(viewer))
    .maybeSingle();

  if (error) {
    console.error("お知らせ取得エラー:", error.message);
    return { data: null, error };
  }
  const row = data as AnnouncementDetail | null;
  return { data: row && onlyTargets([row], viewer).length > 0 ? row : null, error: null };
}

/**
 * 既読を記録する。INSERT は RLS（本人の行・自分に見える公開済みお知らせのみ）を通る。
 * 既に既読なら主キー違反（23505）になるが成功扱い。
 */
export async function markAnnouncementRead(
  userId: number,
  announcementId: number
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("announcement_reads")
    .insert({ announcement_id: announcementId, user_id: userId });
  if (error && error.code !== "23505") {
    console.error("お知らせの既読記録エラー:", error.message);
    return { error };
  }
  return { error: null };
}

// ==================== 管理向け（admin / maintainer） ====================

/** 管理画面の一覧に表示するお知らせ（本文を除く） */
export type ManageAnnouncementListItem = Pick<
  Announcement,
  | "id"
  | "title"
  | "target_statuses"
  | "target_membership_types"
  | "published_at"
  | "send_email"
  | "email_sent_at"
  | "created_at"
  | "updated_at"
>;

const MANAGE_LIST_COLUMNS =
  "id, title, target_statuses, target_membership_types, published_at, send_email, email_sent_at, created_at, updated_at";

/** 管理画面の一覧（下書きを含む、論理削除済みを除く。新しく作った順） */
export async function fetchManageAnnouncements(): Promise<{
  data: ManageAnnouncementListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(MANAGE_LIST_COLUMNS)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("お知らせ一覧（管理）取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as ManageAnnouncementListItem[], error: null };
}

export async function fetchManageAnnouncementById(id: number): Promise<{
  data: Announcement | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) {
    console.error("お知らせ（管理）取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as Announcement | null, error: null };
}

function toRow(input: AnnouncementInput) {
  return {
    title: input.title,
    body: input.body,
    target_statuses: input.target_statuses,
    target_membership_types: input.target_membership_types,
    send_email: input.send_email,
  };
}

/** 2つの配列が同じ要素の集合か（`null` は「指定なし」として `null` とだけ一致） */
function sameMembers(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((value) => setB.has(value));
}

/** 作成する。`is_published` なら作成と同時に公開する（`published_at` を記録） */
export async function createAnnouncement(
  input: AnnouncementInput,
  createdBy: number
): Promise<{ data: Pick<Announcement, "id"> | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      ...toRow(input),
      published_at: input.is_published ? new Date().toISOString() : null,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) {
    console.error("お知らせ作成エラー:", error.message);
    return { data: null, error };
  }
  return { data: data as Pick<Announcement, "id">, error: null };
}

/**
 * 更新する。公開済みのまま更新するときは最初の公開日時を保つ（一覧の並び順と、メール送信の
 * 対象判定を変えない）。非公開にすると `published_at` を消し、アプリ内表示とメールの一斉送信を
 * 止める（送信済みの分は `email_logs` に残り、再公開しても同じ人には送らない）。
 * 対象が存在しない（削除済み・存在しないID）ときは `notFound: true`。
 */
export async function updateAnnouncement(
  id: number,
  input: AnnouncementInput
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const { data: current, error: fetchError } = await fetchManageAnnouncementById(id);
  if (fetchError) {
    return { error: fetchError, notFound: false };
  }
  if (!current) {
    return { error: null, notFound: true };
  }

  const publishedAt = input.is_published
    ? (current.published_at ?? new Date().toISOString())
    : null;
  // 対象を変えたら一斉送信を未完了に戻す。Cron は `email_logs` に行の無い対象者にだけ送るため、
  // 送り終えた人には再送せず、広げた分の対象者にだけ送る（送信中の変更は、Cron 側が
  // `updated_at` の一致を完了の条件にしているため、実行の開始時点の対象だけで完了にならない）
  const targetsChanged =
    !sameMembers(current.target_statuses, input.target_statuses) ||
    !sameMembers(current.target_membership_types, input.target_membership_types);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({
      ...toRow(input),
      published_at: publishedAt,
      ...(targetsChanged ? { email_sent_at: null } : {}),
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("id");
  if (error) {
    console.error("お知らせ更新エラー:", error.message);
    return { error, notFound: false };
  }
  return { error: null, notFound: (data ?? []).length === 0 };
}

/** 論理削除する（アプリ内表示とメールの一斉送信の対象から外れる） */
export async function deleteAnnouncement(
  id: number
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("id");
  if (error) {
    console.error("お知らせ削除エラー:", error.message);
    return { error, notFound: false };
  }
  return { error: null, notFound: (data ?? []).length === 0 };
}
