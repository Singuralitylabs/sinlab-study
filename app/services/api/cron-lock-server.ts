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
 * Cron バッチの実行ロックを取る（`cron_locks` の主キー `name` への INSERT を処理権の claim に
 * する。`claimCheckoutSlot()` と同じパターン）。別の実行が持っていれば null を返し、呼び出し元は
 * 何もせずに終了する。関数のハードタイムアウト等で解放されなかったロックは、`ttlMs` を過ぎて
 * いれば削除して1回だけ取り直す（削除後の INSERT も主キーで排他されるため、取り直しが並行
 * しても1つだけが成功する）。DB エラーは throw する。
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
 * 自分が取ったロックを解放する（`locked_at` が一致する行だけを消し、TTL 経過後に別の実行が
 * 取り直したロックは消さない）。失敗してもログだけ残す（TTL で解ける）。
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
