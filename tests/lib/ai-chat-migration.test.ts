import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_CHAT_ANSWER_MAX_LENGTH,
  AI_CHAT_LIMIT_BOUNDS,
  AI_CHAT_LIMITS,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from "@/app/constants/ai-chat";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261117090000_add_ai_chat.sql"),
  "utf8"
);

describe("ai_chat マイグレーション (#569)", () => {
  it("上限値の CHECK と初期値が定数と同じ", () => {
    const { activePerDay, trialLifetime } = AI_CHAT_LIMIT_BOUNDS;
    expect(migration).toContain(
      `CHECK (active_per_day BETWEEN ${activePerDay.min} AND ${activePerDay.max})`
    );
    expect(migration).toContain(
      `CHECK (trial_lifetime BETWEEN ${trialLifetime.min} AND ${trialLifetime.max})`
    );
    expect(migration).toContain(
      `active_per_day INTEGER NOT NULL DEFAULT ${AI_CHAT_LIMITS.activePerDay}`
    );
    expect(migration).toContain(
      `trial_lifetime INTEGER NOT NULL DEFAULT ${AI_CHAT_LIMITS.trialLifetime}`
    );
  });

  it("保存する質問・回答の文字数の CHECK が定数と同じ", () => {
    expect(migration).toContain(
      `CHECK (char_length(question) BETWEEN 1 AND ${AI_CHAT_MESSAGE_MAX_LENGTH})`
    );
    expect(migration).toContain(
      `CHECK (char_length(answer) BETWEEN 1 AND ${AI_CHAT_ANSWER_MAX_LENGTH})`
    );
  });

  it("利用記録に本文の列が無い", () => {
    const usage = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS public.ai_chat_usage"),
      migration.indexOf("COMMENT ON TABLE public.ai_chat_usage")
    );
    expect(usage).not.toMatch(/\b(question|answer|message|content)\s+TEXT/);
  });

  it("claim_ai_chat は service_role だけが実行でき、ユーザー単位でロックする", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('claim_ai_chat'), p_user_id)");
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.claim_ai_chat\([\s\S]*?FROM PUBLIC, anon, authenticated;/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_ai_chat\([\s\S]*?TO service_role;/
    );
  });

  it("failed と古い pending を数えない", () => {
    expect(migration).toContain("u.status <> 'failed'");
    expect(migration).toContain("NOT (u.status = 'pending' AND u.created_at < p_stale_before)");
  });

  it("RLS はヘルパーを (select ...) で包み、受講生は利用記録を書けない", () => {
    const calls = migration.match(/get_user_(id|role)\(\)/g) ?? [];
    const wrapped = migration.match(/\(select get_user_(id|role)\(\)\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(wrapped.length).toBe(calls.length);
    expect(migration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.ai_chat_usage FROM authenticated;"
    );
    expect(migration).toContain(
      "AND EXISTS (SELECT 1 FROM public.learning_contents lc WHERE lc.id = content_id)"
    );
  });
});
