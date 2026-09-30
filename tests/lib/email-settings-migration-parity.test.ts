import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EMAIL_DIGEST_DAILY_LIMIT_MAX,
  EMAIL_DIGEST_MAX_PER_DAY,
  EMAIL_KINDS,
  INACTIVITY_REMINDER_DAYS,
  TRIAL_NURTURE_DAYS,
  WEEKLY_DIGEST_WEEKDAY,
} from "@/app/constants/notifications";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261002000000_add_email_settings.sql"),
  "utf8"
);

/** Parses the seed rows `('kind', enabled, send_days, send_weekday)` of email_kind_settings. */
function seededKinds() {
  const rows = [
    ...migration.matchAll(/\('([a-z_]+)', (true|false), (NULL|ARRAY\[[\d, ]+\]), (NULL|\d)\)/g),
  ];
  return new Map(
    rows.map(([, kind, enabled, days, weekday]) => [
      kind,
      {
        enabled: enabled === "true",
        days: days === "NULL" ? null : (JSON.parse(days.replace("ARRAY", "")) as number[]),
        weekday: weekday === "NULL" ? null : Number(weekday),
      },
    ])
  );
}

describe("email_kind_settings の初期値（マイグレーションと定数の一致）", () => {
  const seeded = seededKinds();

  it("EMAIL_KIND の全種別を投入し、繰り越し予約（weekly_digest_reserved）は含めない", () => {
    expect([...seeded.keys()].sort()).toEqual([...EMAIL_KINDS].sort());
    expect(migration).not.toMatch(/\('weekly_digest_reserved'/);
  });

  it("全種別が有効で始まる（適用直後の挙動を変えない）", () => {
    expect([...seeded.values()].every((row) => row.enabled)).toBe(true);
  });

  it("送る日・曜日は #253 時点の定数と同じ", () => {
    expect(seeded.get("inactivity_reminder")?.days).toEqual([...INACTIVITY_REMINDER_DAYS]);
    expect(seeded.get("trial_nurture")?.days).toEqual([...TRIAL_NURTURE_DAYS]);
    expect(seeded.get("weekly_digest")?.weekday).toBe(WEEKLY_DIGEST_WEEKDAY);
    expect(WEEKLY_DIGEST_WEEKDAY).toBe(1);
  });

  it("send_days は対象の2種別だけ、send_weekday は weekly_digest だけが持つ", () => {
    for (const [kind, row] of seeded) {
      expect(row.days !== null).toBe(kind === "inactivity_reminder" || kind === "trial_nurture");
      expect(row.weekday !== null).toBe(kind === "weekly_digest");
    }
  });

  it("1日の上限の初期値は現在の定数（80）で、入力上限の範囲内", () => {
    expect(migration).toMatch(
      new RegExp(
        `INSERT INTO public\\.email_settings \\(id, digest_daily_limit\\) VALUES \\(1, ${EMAIL_DIGEST_MAX_PER_DAY}\\)`
      )
    );
    expect(EMAIL_DIGEST_MAX_PER_DAY).toBe(80);
    expect(migration).toContain(`digest_daily_limit BETWEEN 1 AND ${EMAIL_DIGEST_DAILY_LIMIT_MAX}`);
  });
});

describe("RLS（admin のみ・同一操作は1本）", () => {
  const policies = [...migration.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+) FOR (\w+)/g)];

  it("両テーブルで RLS を有効にする", () => {
    expect(migration).toContain("ALTER TABLE public.email_kind_settings ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY");
  });

  it("SELECT / UPDATE を各1本だけ作り、INSERT / DELETE のポリシーは作らない", () => {
    const summary = policies.map(([, , table, op]) => `${table}:${op}`).sort();
    expect(summary).toEqual([
      "email_kind_settings:SELECT",
      "email_kind_settings:UPDATE",
      "email_settings:SELECT",
      "email_settings:UPDATE",
    ]);
  });

  it("判定は (select get_user_role()) = 'admin' の形で、maintainer には開放しない", () => {
    expect(migration.match(/\(select get_user_role\(\)\) = 'admin'/g)).toHaveLength(6);
    expect(migration).not.toContain("maintainer");
    // Every call is wrapped in (select ...) so it is evaluated once per statement, not per row.
    expect(migration.match(/get_user_role\(\)/g)).toHaveLength(6);
  });
});
