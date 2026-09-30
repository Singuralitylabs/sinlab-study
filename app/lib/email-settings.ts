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
  sendDays: number[] | null;
  sendWeekday: number | null;
  updatedAt: string;
  updatedBy: number | null;
};

export type EmailSettingsSnapshot = {
  kinds: Record<EmailKind, EmailKindSetting>;
  digestDailyLimit: number;
  digestUpdatedAt: string;
  digestUpdatedBy: number | null;
};

export type EmailKindSettingRow = {
  kind: string;
  enabled: boolean;
  send_days: number[] | null;
  send_weekday: number | null;
  updated_at: string;
  updated_by: number | null;
};

export type EmailSettingsRow = {
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
    kinds[kind] = {
      kind,
      enabled: row.enabled,
      sendDays: row.send_days ? [...row.send_days].sort((a, b) => a - b) : null,
      sendWeekday: row.send_weekday,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  return {
    kinds,
    digestDailyLimit: settingsRow.digest_daily_limit,
    digestUpdatedAt: settingsRow.updated_at,
    digestUpdatedBy: settingsRow.updated_by,
  };
}
