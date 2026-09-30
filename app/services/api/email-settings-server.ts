import type { PostgrestError } from "@supabase/supabase-js";
import {
  EMAIL_LOG_PAGE_SIZE,
  type EmailKind,
  PROMOTIONAL_EMAIL_KINDS,
  WEEKLY_DIGEST_RESERVATION_KIND,
} from "@/app/constants/notifications";
import { jstStartOfDayIso, toJstDateString } from "@/app/lib/email-digest";
import {
  type EmailKindSettingRow,
  type EmailSettingsRow,
  type EmailSettingsSnapshot,
  parseEmailSettings,
} from "@/app/lib/email-settings";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;
type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const KIND_COLUMNS = "kind, enabled, send_days, send_weekday, updated_at, updated_by";
const SETTINGS_COLUMNS = "digest_daily_limit, updated_at, updated_by";

/**
 * Reads the settings for the promotional send path (service_role). Throws on any DB error or
 * unexpected content so the caller fails closed (sends no promotional mail). Never cached: every
 * run reads the current values.
 */
export async function fetchEmailSettings(
  supabase: AdminClient | ServerClient
): Promise<EmailSettingsSnapshot> {
  const [kinds, settings] = await Promise.all([
    supabase.from("email_kind_settings").select(KIND_COLUMNS),
    supabase.from("email_settings").select(SETTINGS_COLUMNS).eq("id", 1).maybeSingle(),
  ]);
  if (kinds.error) {
    throw new Error(kinds.error.message);
  }
  if (settings.error) {
    throw new Error(settings.error.message);
  }
  return parseEmailSettings(
    (kinds.data ?? []) as EmailKindSettingRow[],
    settings.data as EmailSettingsRow | null
  );
}

/**
 * Whether a transactional kind may be sent. Fail-safe: when the setting cannot be read (DB error,
 * missing row) it returns true so signup / payment notices are never dropped by a settings
 * outage. Only an explicit `enabled = false` blocks sending.
 */
export async function isTransactionalEmailEnabled(
  supabase: AdminClient,
  kind: EmailKind
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("email_kind_settings")
      .select("enabled")
      .eq("kind", kind)
      .maybeSingle();
    if (error) {
      console.error("[メール通知] 種別設定の取得エラー（有効として送信します）:", error.message);
      return true;
    }
    return data?.enabled !== false;
  } catch (error) {
    console.error("[メール通知] 種別設定の取得エラー（有効として送信します）:", error);
    return true;
  }
}

export type EmailSettingsWithEditors = EmailSettingsSnapshot & {
  editorNames: Record<number, string>;
};

/** Settings for /admin/emails, read with the admin's own session (RLS: admin only). */
export async function fetchEmailSettingsForAdmin(): Promise<{
  data: EmailSettingsWithEditors | null;
  error: string | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const snapshot = await fetchEmailSettings(supabase);
    const editorIds = [
      ...new Set(
        [...Object.values(snapshot.kinds).map((k) => k.updatedBy), snapshot.digestUpdatedBy].filter(
          (id): id is number => id !== null
        )
      ),
    ];
    const editorNames: Record<number, string> = {};
    if (editorIds.length > 0) {
      const { data } = await supabase.from("users").select("id, display_name").in("id", editorIds);
      for (const row of data ?? []) {
        editorNames[row.id] = row.display_name;
      }
    }
    return { data: { ...snapshot, editorNames }, error: null };
  } catch (error) {
    console.error("メール設定取得エラー:", error instanceof Error ? error.message : error);
    return { data: null, error: "メール設定の取得に失敗しました" };
  }
}

export type EmailKindSettingsPatch = {
  enabled?: boolean;
  send_days?: number[];
  send_weekday?: number;
};

/**
 * Updates one kind row with the admin's session. RLS allows UPDATE only for admins, so a non-admin
 * session updates 0 rows even if the route check were bypassed. `updated: false` means no row
 * matched (missing kind or RLS denied).
 */
export async function updateEmailKindSettings(
  kind: EmailKind,
  patch: EmailKindSettingsPatch,
  updatedBy: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("email_kind_settings")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("kind", kind)
    .select("kind");
  if (error) {
    console.error("メール種別設定更新エラー:", error.message);
    return { error, updated: false };
  }
  return { error: null, updated: (data?.length ?? 0) > 0 };
}

export async function updateDigestDailyLimit(
  limit: number,
  updatedBy: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("email_settings")
    .update({
      digest_daily_limit: limit,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", 1)
    .select("id");
  if (error) {
    console.error("メール共通設定更新エラー:", error.message);
    return { error, updated: false };
  }
  return { error: null, updated: (data?.length ?? 0) > 0 };
}

export const EMAIL_LOG_STATUSES = ["sent", "failed", "pending"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

export type EmailLogFilters = {
  kind?: EmailKind;
  status?: EmailLogStatus;
  page?: number;
};

export type EmailLogListItem = {
  id: number;
  created_at: string;
  kind: string;
  reference_key: string;
  sent_at: string | null;
  error: string | null;
  status: EmailLogStatus;
  user: { display_name: string; email: string } | null;
};

/**
 * Send history, newest first. Only the columns shown are selected (no bodies exist in
 * email_logs; provider_message_id is not needed), and the carry-over reservation rows are never
 * listed: they send no mail. Read with service_role because `email_logs` has no RLS policies; the
 * caller (API route / page) must have verified admin.
 */
export async function fetchEmailLogs(filters: EmailLogFilters = {}): Promise<{
  data: EmailLogListItem[] | null;
  hasNext: boolean;
  error: string | null;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * EMAIL_LOG_PAGE_SIZE;
  try {
    const supabase = await createAdminSupabaseClient();
    let query = supabase
      .from("email_logs")
      .select(
        "id, created_at, kind, reference_key, sent_at, error, user:users(display_name, email)"
      )
      .neq("kind", WEEKLY_DIGEST_RESERVATION_KIND)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + EMAIL_LOG_PAGE_SIZE);

    if (filters.kind) {
      query = query.eq("kind", filters.kind);
    }
    if (filters.status === "sent") {
      query = query.not("sent_at", "is", null);
    } else if (filters.status === "failed") {
      query = query.is("sent_at", null).not("error", "is", null);
    } else if (filters.status === "pending") {
      query = query.is("sent_at", null).is("error", null);
    }

    const { data, error } = await query;
    if (error) {
      console.error("メール送信履歴取得エラー:", error.message);
      return { data: null, hasNext: false, error: "送信履歴の取得に失敗しました" };
    }
    const rows = (data ?? []) as unknown as Omit<EmailLogListItem, "status">[];
    return {
      data: rows.slice(0, EMAIL_LOG_PAGE_SIZE).map((row) => ({
        ...row,
        status: row.sent_at ? "sent" : row.error ? "failed" : "pending",
      })),
      hasNext: rows.length > EMAIL_LOG_PAGE_SIZE,
      error: null,
    };
  } catch (error) {
    console.error("メール送信履歴取得エラー:", error);
    return { data: null, hasNext: false, error: "送信履歴の取得に失敗しました" };
  }
}

/** Promotional mails claimed today (JST), i.e. what counts against the daily limit. */
export async function fetchTodayPromotionalCount(
  now: Date = new Date()
): Promise<{ count: number | null; error: string | null }> {
  try {
    const supabase = await createAdminSupabaseClient();
    const { count, error } = await supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .in("kind", [...PROMOTIONAL_EMAIL_KINDS])
      .gte("created_at", jstStartOfDayIso(toJstDateString(now)));
    if (error) {
      console.error("今日の送信状況取得エラー:", error.message);
      return { count: null, error: "今日の送信状況の取得に失敗しました" };
    }
    return { count: count ?? 0, error: null };
  } catch (error) {
    console.error("今日の送信状況取得エラー:", error);
    return { count: null, error: "今日の送信状況の取得に失敗しました" };
  }
}
