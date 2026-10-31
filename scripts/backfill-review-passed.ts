/**
 * One-shot fill of ai_reviews.passed for rubric rows that were stored while the pass score was
 * disabled (passed IS NULL). Recomputes with isReviewPassed() from the stored review_json.
 * Does not call Gemini. Dry-run unless --write is passed. Dev projects only (--confirm-dev).
 */
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { asReviewJson, isReviewPassed } from "@/app/lib/grading";
import type { Database } from "@/app/types/lib/database.types";

export interface BackfillReviewRow {
  id: number;
  score_kind: string;
  passed: boolean | null;
  overall_score: number | null;
  review_json: unknown;
}

/**
 * Value to write, or null when the row must be left alone (not a null rubric pass, or the stored
 * JSON cannot be judged). Never invents a verdict the labels do not support.
 */
export function planPassedBackfill(row: BackfillReviewRow): boolean | null {
  if (row.score_kind !== "rubric" || row.passed !== null) {
    return null;
  }
  const reviewJson = asReviewJson(row.review_json);
  if (!reviewJson) {
    return null;
  }
  return isReviewPassed(reviewJson, row.overall_score);
}

export function readArgs(argv: string[]) {
  let write = false;
  let confirmed = false;
  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg === "--confirm-dev") {
      confirmed = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { write, confirmed };
}

const PAGE = 500;

async function loadPending(supabase: SupabaseClient<Database>): Promise<BackfillReviewRow[]> {
  const rows: BackfillReviewRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("ai_reviews")
      .select("id, score_kind, passed, overall_score, review_json")
      .eq("score_kind", "rubric")
      .is("passed", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }
    const page = (data ?? []) as BackfillReviewRow[];
    rows.push(...page);
    if (page.length < PAGE) {
      return rows;
    }
    from += PAGE;
  }
}

async function main() {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const { write, confirmed } = readArgs(process.argv.slice(2));
  if (!confirmed) {
    throw new Error("Pass --confirm-dev to confirm this targets a dev project, not production.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient<Database>(url, serviceRoleKey);
  const pending = await loadPending(supabase);
  let pass = 0;
  let fail = 0;
  let skipped = 0;
  for (const row of pending) {
    const next = planPassedBackfill(row);
    if (next === null) {
      skipped += 1;
      continue;
    }
    if (next) {
      pass += 1;
    } else {
      fail += 1;
    }
    if (!write) {
      continue;
    }
    const { error } = await supabase.from("ai_reviews").update({ passed: next }).eq("id", row.id);
    if (error) {
      throw new Error(`id ${row.id}: ${error.message}`);
    }
  }

  console.log(
    `${write ? "Updated" : "Would update"} pass=${pass} fail=${fail} skipped=${skipped} (AI was not called)`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
