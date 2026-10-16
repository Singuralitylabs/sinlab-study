import {
  EMAIL_DIGEST_DAILY_LIMIT_MAX,
  EMAIL_DIGEST_DAILY_LIMIT_MIN,
  EMAIL_KIND_WITH_SEND_WEEKDAY,
  EMAIL_KINDS,
  EMAIL_KINDS_WITH_SEND_DAYS,
  EMAIL_SEND_DAY_MAX,
  EMAIL_SEND_DAY_MIN,
  EMAIL_SEND_DAYS_MAX_COUNT,
  type EmailKind,
} from "@/app/constants/notifications";

export type EmailKindSetting = {
  kind: EmailKind;
  enabled: boolean;
  /** Web Push channel. Missing on older fixtures means the column default, false. */
  pushEnabled: boolean;
  sendDays: number[] | null;
  sendWeekday: number | null;
  updatedAt: string;
  updatedBy: number | null;
};

export type EmailSettingsSnapshot = {
  kinds: Record<EmailKind, EmailKindSetting>;
  sendingEnabled: boolean;
  sendingUpdatedAt: string | null;
  sendingUpdatedBy: number | null;
  digestDailyLimit: number;
  digestUpdatedAt: string;
  digestUpdatedBy: number | null;
};

export type EmailKindSettingRow = {
  kind: string;
  enabled: boolean;
  /** Omitted rows match the column default (false). A non-boolean value fails closed. */
  push_enabled?: boolean;
  send_days: number[] | null;
  send_weekday: number | null;
  updated_at: string;
  updated_by: number | null;
};

export type EmailSettingsRow = {
  sending_enabled: boolean;
  sending_updated_at: string | null;
  sending_updated_by: number | null;
  digest_daily_limit: number;
  updated_at: string;
  updated_by: number | null;
};

const isEmailKind = (kind: string): kind is EmailKind => (EMAIL_KINDS as string[]).includes(kind);

function isValidSendDays(days: unknown): days is number[] {
  return (
    Array.isArray(days) &&
    days.length >= 1 &&
    days.length <= EMAIL_SEND_DAYS_MAX_COUNT &&
    new Set(days).size === days.length &&
    days.every((d) => Number.isInteger(d) && d >= EMAIL_SEND_DAY_MIN && d <= EMAIL_SEND_DAY_MAX)
  );
}

/**
 * Builds the snapshot the cron reads. Anything unexpected (a kind row missing, a value the kind
 * needs missing or out of range, the single settings row missing) throws: the caller is the
 * promotional send path, which must fail closed rather than guess with defaults.
 */
export function parseEmailSettings(
  kindRows: EmailKindSettingRow[],
  settingsRow: EmailSettingsRow | null
): EmailSettingsSnapshot {
  if (!settingsRow) {
    throw new Error("email_settings の行がありません");
  }
  // The global switch is the "do not send before the terms revision" gate: anything but a real
  // boolean (a column missing after a partial migration, a hand edit) must stop the run.
  if (typeof settingsRow.sending_enabled !== "boolean") {
    throw new Error("email_settings.sending_enabled が真偽値ではありません");
  }
  if (
    !Number.isInteger(settingsRow.digest_daily_limit) ||
    settingsRow.digest_daily_limit < EMAIL_DIGEST_DAILY_LIMIT_MIN ||
    settingsRow.digest_daily_limit > EMAIL_DIGEST_DAILY_LIMIT_MAX
  ) {
    throw new Error("email_settings.digest_daily_limit が範囲外です");
  }

  const byKind = new Map<string, EmailKindSettingRow>();
  for (const row of kindRows) {
    if (isEmailKind(row.kind)) {
      byKind.set(row.kind, row);
    }
  }

  const kinds = {} as Record<EmailKind, EmailKindSetting>;
  for (const kind of EMAIL_KINDS) {
    const row = byKind.get(kind);
    if (!row) {
      throw new Error(`email_kind_settings に ${kind} の行がありません`);
    }
    if (EMAIL_KINDS_WITH_SEND_DAYS.includes(kind) && !isValidSendDays(row.send_days)) {
      throw new Error(`email_kind_settings.send_days が不正です: kind=${kind}`);
    }
    if (
      kind === EMAIL_KIND_WITH_SEND_WEEKDAY &&
      !(
        row.send_weekday !== null &&
        Number.isInteger(row.send_weekday) &&
        row.send_weekday >= 0 &&
        row.send_weekday <= 6
      )
    ) {
      throw new Error(`email_kind_settings.send_weekday が不正です: kind=${kind}`);
    }
    if (
      row.push_enabled !== undefined &&
      row.push_enabled !== null &&
      typeof row.push_enabled !== "boolean"
    ) {
      throw new Error(`email_kind_settings.push_enabled が真偽値ではありません: kind=${kind}`);
    }
    kinds[kind] = {
      kind,
      enabled: row.enabled,
      pushEnabled: row.push_enabled === true,
      sendDays: row.send_days ? [...row.send_days].sort((a, b) => a - b) : null,
      sendWeekday: row.send_weekday,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  return {
    kinds,
    sendingEnabled: settingsRow.sending_enabled,
    sendingUpdatedAt: settingsRow.sending_updated_at,
    sendingUpdatedBy: settingsRow.sending_updated_by,
    digestDailyLimit: settingsRow.digest_daily_limit,
    digestUpdatedAt: settingsRow.updated_at,
    digestUpdatedBy: settingsRow.updated_by,
  };
}
