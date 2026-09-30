import type { SupabaseClient } from "@supabase/supabase-js";

export type CronLock = { name: string; lockedAt: string };

async function insertLock(
  supabase: SupabaseClient,
  lock: CronLock
): Promise<"claimed" | "held" | Error> {
  const { error } = await supabase
    .from("cron_locks")
    .insert({ name: lock.name, locked_at: lock.lockedAt });
  if (!error) {
    return "claimed";
  }
  return error.code === "23505" ? "held" : new Error(error.message);
}

/**
 * Takes a Cron batch run lock: an INSERT into the `cron_locks` primary key `name` is the claim
 * (same pattern as claimCheckoutSlot()). Returns null if another run holds it and the caller
 * exits without doing anything. A lock not released (e.g. hard function timeout) is deleted once
 * past `ttlMs` and re-acquired once; the INSERT after deletion is also PK-exclusive, so
 * concurrent re-acquisitions still let only one win. Throws on DB errors.
 */
export async function claimCronLock(
  supabase: SupabaseClient,
  name: string,
  ttlMs: number,
  now: Date = new Date()
): Promise<CronLock | null> {
  const lock = { name, lockedAt: now.toISOString() };

  const first = await insertLock(supabase, lock);
  if (first instanceof Error) {
    throw first;
  }
  if (first === "claimed") {
    return lock;
  }

  const { error: deleteError } = await supabase
    .from("cron_locks")
    .delete()
    .eq("name", name)
    .lt("locked_at", new Date(now.getTime() - ttlMs).toISOString());
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const retry = await insertLock(supabase, lock);
  if (retry instanceof Error) {
    throw retry;
  }
  return retry === "claimed" ? lock : null;
}

/**
 * Releases our own lock: deletes only the row whose `locked_at` matches, so a lock another run
 * re-acquired after the TTL is not removed. Failures are only logged (the TTL frees it).
 */
export async function releaseCronLock(supabase: SupabaseClient, lock: CronLock): Promise<void> {
  try {
    const { error } = await supabase
      .from("cron_locks")
      .delete()
      .eq("name", lock.name)
      .eq("locked_at", lock.lockedAt);
    if (error) {
      console.error(`[Cron] ロックの解放に失敗しました: name=${lock.name}`, error.message);
    }
  } catch (error) {
    console.error(`[Cron] ロックの解放で予期しないエラーが発生しました: name=${lock.name}`, error);
  }
}
