import type { PostgrestError } from "@supabase/supabase-js";
import { EMAIL_TEST_SEND_DAILY_LIMIT } from "@/app/constants/notifications";
import { jstStartOfDayIso, toJstDateString } from "@/app/lib/email-digest";
import {
  DEFAULT_EMAIL_BRANDING,
  EMAIL_TEMPLATE_KEYS,
  type EmailBranding,
  type EmailTemplateKey,
  type EmailTemplateText,
  type EmailTexts,
  isEmailTemplateKey,
  sanitizeEmailValue,
} from "@/app/lib/email-template";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;
type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type BrandingRow = { service_name: string | null; service_subtitle: string | null } | null;

function toBranding(row: BrandingRow): EmailBranding {
  // A missing row means the settings were never seeded: use the code defaults. A NULL subtitle in
  // an existing row is the admin's choice (no supplement), so it is kept.
  if (!row) {
    return DEFAULT_EMAIL_BRANDING;
  }
  const serviceName = sanitizeEmailValue(row.service_name ?? "");
  return {
    serviceName: serviceName || DEFAULT_EMAIL_BRANDING.serviceName,
    serviceSubtitle: row.service_subtitle ? sanitizeEmailValue(row.service_subtitle) || null : null,
  };
}

/**
 * Reads the stored email text for one send run (service_role). Fail-safe by design: any DB error,
 * exception or unusable row yields the code defaults for what could not be read, so an unreadable
 * text never stops a signup / payment notice or a periodic mail. Call it once per run (broadcasts
 * must not read per recipient).
 */
export async function loadEmailTexts(supabase: AdminClient): Promise<EmailTexts> {
  let branding = DEFAULT_EMAIL_BRANDING;
  const templates: EmailTexts["templates"] = {};
  try {
    const [settings, rows] = await Promise.all([
      supabase
        .from("email_settings")
        .select("service_name, service_subtitle")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("email_templates").select("template_key, subject, body"),
    ]);
    if (settings.error) {
      console.error(
        "[メール通知] サービス名の取得エラー（既定値で送ります）:",
        settings.error.message
      );
    } else {
      branding = toBranding(settings.data as BrandingRow);
    }
    if (rows.error) {
      console.error("[メール通知] メール文面の取得エラー（既定値で送ります）:", rows.error.message);
    } else {
      for (const row of rows.data ?? []) {
        if (isEmailTemplateKey(row.template_key)) {
          templates[row.template_key] = { subject: row.subject, body: row.body };
        }
      }
    }
  } catch (error) {
    console.error("[メール通知] メール文面の取得エラー（既定値で送ります）:", error);
  }
  return { branding, templates };
}

export type EmailTemplateRow = {
  key: EmailTemplateKey;
  stored: (EmailTemplateText & { updatedAt: string; updatedBy: number | null }) | null;
};

export type EmailTemplatesForAdmin = {
  branding: EmailBranding & { updatedAt: string | null; updatedBy: number | null };
  templates: EmailTemplateRow[];
  editorNames: Record<number, string>;
};

/** Templates and branding for /admin/emails/templates, read with the admin's own session (RLS). */
export async function fetchEmailTemplatesForAdmin(): Promise<{
  data: EmailTemplatesForAdmin | null;
  error: string | null;
}> {
  try {
    const supabase: ServerClient = await createServerSupabaseClient();
    const [settings, rows] = await Promise.all([
      supabase
        .from("email_settings")
        .select("service_name, service_subtitle, updated_at, updated_by")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("email_templates")
        .select("template_key, subject, body, updated_at, updated_by"),
    ]);
    if (settings.error) {
      throw new Error(settings.error.message);
    }
    if (rows.error) {
      throw new Error(rows.error.message);
    }
    const stored = new Map(
      (rows.data ?? [])
        .filter((row) => isEmailTemplateKey(row.template_key))
        .map((r) => [r.template_key, r])
    );
    const templates: EmailTemplateRow[] = EMAIL_TEMPLATE_KEYS.map((key) => {
      const row = stored.get(key);
      return {
        key,
        stored: row
          ? {
              subject: row.subject,
              body: row.body,
              updatedAt: row.updated_at,
              updatedBy: row.updated_by,
            }
          : null,
      };
    });
    const editorIds = [
      ...new Set(
        [
          ...templates.map((t) => t.stored?.updatedBy ?? null),
          settings.data?.updated_by ?? null,
        ].filter((id): id is number => id !== null)
      ),
    ];
    const editorNames: Record<number, string> = {};
    if (editorIds.length > 0) {
      const { data } = await supabase.from("users").select("id, display_name").in("id", editorIds);
      for (const row of data ?? []) {
        editorNames[row.id] = row.display_name;
      }
    }
    return {
      data: {
        branding: {
          ...toBranding(settings.data),
          updatedAt: settings.data?.updated_at ?? null,
          updatedBy: settings.data?.updated_by ?? null,
        },
        templates,
        editorNames,
      },
      error: null,
    };
  } catch (error) {
    console.error("メール文面取得エラー:", error instanceof Error ? error.message : error);
    return { data: null, error: "メール文面の取得に失敗しました" };
  }
}

/**
 * Saves (upserts) one template with the admin's session. RLS allows INSERT / UPDATE only for
 * admins, so a non-admin session is refused by the DB even if the route check were bypassed.
 * Callers validate the key and the text first (`validateEmailTemplateText()`).
 */
export async function upsertEmailTemplate(
  key: EmailTemplateKey,
  text: EmailTemplateText,
  updatedBy: number
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("email_templates").upsert(
    {
      template_key: key,
      subject: text.subject,
      body: text.body,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "template_key" }
  );
  if (error) {
    console.error("メール文面更新エラー:", error.message);
  }
  return { error };
}

/** "Restore default": deletes the row so the code default applies again. */
export async function resetEmailTemplate(
  key: EmailTemplateKey
): Promise<{ error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("email_templates").delete().eq("template_key", key);
  if (error) {
    console.error("メール文面リセットエラー:", error.message);
  }
  return { error };
}

export async function updateEmailBranding(
  branding: { serviceName: string; serviceSubtitle: string | null },
  updatedBy: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("email_settings")
    .update({
      service_name: branding.serviceName,
      service_subtitle: branding.serviceSubtitle,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", 1)
    .select("id");
  if (error) {
    console.error("メールのサービス名更新エラー:", error.message);
    return { error, updated: false };
  }
  return { error: null, updated: (data?.length ?? 0) > 0 };
}

/** Texts for the preview / test send: the stored branding, with the unsaved draft laid over it. */
export async function loadEmailTextsWithDraft(
  key: EmailTemplateKey,
  draft: EmailTemplateText,
  brandingDraft?: { serviceName: string; serviceSubtitle: string | null }
): Promise<EmailTexts> {
  const base = await loadEmailTexts(await createAdminSupabaseClient());
  return {
    branding: brandingDraft ?? base.branding,
    templates: { ...base.templates, [key]: draft },
  };
}

export type TestSendClaim =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false; error: string | null };

/**
 * Claims one of today's test sends (JST, all admins together): inserts a row, then counts today's
 * rows; over the cap the row is removed again. Insert-then-count keeps two simultaneous requests
 * from both slipping under the cap. A DB error refuses the send (fail closed), so a broken
 * counter can never turn into unlimited sends. Test sends are not written to `email_logs`.
 */
export async function claimTestSend(
  userId: number,
  now: Date = new Date()
): Promise<TestSendClaim> {
  try {
    const supabase = await createAdminSupabaseClient();
    const { data: claimed, error: insertError } = await supabase
      .from("email_test_sends")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (insertError || !claimed) {
      console.error("テスト送信の記録エラー:", insertError?.message);
      return { allowed: false, error: "テスト送信の準備に失敗しました" };
    }
    const release = async () => {
      const { error } = await supabase.from("email_test_sends").delete().eq("id", claimed.id);
      if (error) {
        console.error("テスト送信の記録の削除エラー:", error.message);
      }
    };
    const { count, error: countError } = await supabase
      .from("email_test_sends")
      .select("id", { count: "exact", head: true })
      .gte("created_at", jstStartOfDayIso(toJstDateString(now)));
    if (countError || count === null) {
      console.error("テスト送信の回数取得エラー:", countError?.message);
      await release();
      return { allowed: false, error: "テスト送信の準備に失敗しました" };
    }
    if (count > EMAIL_TEST_SEND_DAILY_LIMIT) {
      await release();
      return { allowed: false, error: null };
    }
    return { allowed: true, release };
  } catch (error) {
    console.error("テスト送信の準備エラー:", error);
    return { allowed: false, error: "テスト送信の準備に失敗しました" };
  }
}
