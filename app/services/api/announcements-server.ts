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
 * Announcements (#254): reads and writes use the normal client (RLS) for both students and
 * managers; service_role is never used here (only the bulk email extraction uses the Cron
 * service_role path, in email-digest-server.ts).
 * Student-facing reads have two layers of defense: the RLS SELECT policy plus app-layer filters
 * (published, not deleted, target status, target membership type). admin / maintainer see
 * everything via RLS, so without the app-layer filter drafts and non-target announcements would
 * appear on student screens.
 */

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Announcement shown on student screens (list and dashboard do not use the body). */
export type AnnouncementSummary = Pick<
  Announcement,
  "id" | "title" | "published_at" | "target_statuses" | "target_membership_types"
>;
export type AnnouncementDetail = AnnouncementSummary & Pick<Announcement, "body">;
export type AnnouncementWithReadState = AnnouncementSummary & { isRead: boolean };

/** Viewer of announcements: values from getServerAuth() plus the user's own membership type. */
export type AnnouncementViewer = {
  userId: number;
  status: UserStatusType;
  membershipType: string | null;
};

const SUMMARY_COLUMNS = "id, title, published_at, target_statuses, target_membership_types";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, body`;

/**
 * Builds the viewer. Only active / trial users can view announcements; others (rejected, unknown)
 * get null. getServerAuth() has no membership type, so it is read from the user's own row
 * (readable via RLS); if unreadable return null (announcements targeted by type stay hidden, the
 * safe side).
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
 * Turns the app-layer filter (published, not deleted, target status, target membership type) into
 * a PostgREST membership condition. Same conditions as RLS, so an admin / maintainer opening a
 * student screen only gets announcements targeting themselves. A viewer without a membership type
 * (e.g. trial) only matches announcements for all types.
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
 * Returns published announcements targeting the user, newest first, with read state. Reads come
 * from an embedded `announcement_reads` in the same query (own rows only; RLS also only allows
 * own rows).
 * - `{ limit }`: up to `limit` newest (side-nav unread badge, dashboard)
 * - `{ page, pageSize }`: a page of the list (also returns total `count`)
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

/** If it cannot be read, treat as read so the detail screen does not re-record a read. */
export async function isAnnouncementRead(
  viewer: AnnouncementViewer,
  announcementId: number
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const readIds = await fetchReadIds(supabase, viewer.userId, [announcementId]);
  return readIds === null || readIds.has(announcementId);
}

/**
 * Viewer for the current request, shared by layout (unread badge), dashboard and list to avoid
 * refetching (`React.cache()`).
 */
export const getAnnouncementViewer = cache(async (): Promise<AnnouncementViewer | null> => {
  const { userId, userStatus } = await getServerAuth();
  return resolveAnnouncementViewer({ userId, userStatus });
});

/**
 * Announcements targeting the current viewer with read state (newest first, up to
 * UNREAD_ANNOUNCEMENT_SCAN_LIMIT), for the badge and dashboard. Empty without a viewer. The list
 * screen pages with fetchAnnouncementsWithReadState().
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

/** Unread count for the badge; 0 on failure so the layout still renders. */
export async function fetchUnreadAnnouncementCount(): Promise<number> {
  try {
    const { data } = await getViewerAnnouncements();
    return (data ?? []).filter((row) => !row.isRead).length;
  } catch (error) {
    console.error("お知らせの未読件数の取得エラー:", error);
    return 0;
  }
}

/**
 * One published announcement targeting the user (null for non-target, draft, deleted, or missing
 * ID).
 */
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
 * Records a read. The INSERT goes through RLS (own row, visible published announcements only). An
 * existing read raises a PK violation (23505) that is treated as success.
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

/** Announcement shown in the management list (no body). */
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

/** Management list: includes drafts, excludes soft-deleted, newest created first. */
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

/** Whether two arrays hold the same members (`null` means "unspecified" and matches only `null`). */
function sameMembers(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((value) => setB.has(value));
}

/** Creates it; with `is_published` it is published immediately (records `published_at`). */
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
 * When updating while staying published, keep the first publish time (so list order and email
 * target decision do not change). Unpublishing clears `published_at` and stops in-app display and
 * bulk email (sent ones stay in `email_logs`, so republishing does not resend to them). Returns
 * `notFound: true` for deleted or missing targets.
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
  // Changing targets resets the bulk send to incomplete. Cron only sends to targets with no
  // `email_logs` row, so people already sent are not resent and only the widened targets receive
  // it. An edit during a send cannot complete the run for the old targets, because Cron requires
  // a matching `updated_at` to mark completion.
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

/** Soft delete (removes it from in-app display and bulk email targets). */
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
