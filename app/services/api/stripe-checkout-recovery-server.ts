import Stripe from "stripe";
import {
  activateUserFromCheckoutSession,
  claimEvent,
  extractUserId,
  reactivateUserFromMirror,
} from "@/app/services/api/stripe-webhook-server";
import { sendSlackCheckoutRecoveryNotification } from "@/app/services/notifications/slack";

/**
 * Checkout API（`POST /api/stripe/checkout`）の自己復旧処理（#250）。
 *
 * Webhookとsuccessページの両方が失敗すると、Checkout作成の処理権が決済済みのセッションを
 * 保持したまま残り、そのままでは409が永久に続く。ここではその状態を、Webhookと同じ冪等な
 * 反映処理で解消する。`stripe-webhook-server.ts` が `stripe-server.ts` を import している
 * ため、両方を使うこの処理は独立したモジュールに置く（循環 import を作らない）。
 */

/** 自動復旧不可通知の重複を抑止する期間（分）。同じ状態の通知は、この間に1回だけ送る */
const RECOVERY_NOTICE_INTERVAL_MINUTES = 60;

/** 自動復旧不可通知の重複抑止に使う `stripe_events` の種別（Webhookのイベント種別と区別する） */
const RECOVERY_NOTICE_TYPE = "app.checkout_recovery_notice";

export type CheckoutRecovery =
  | { kind: "activated"; sessionId: string }
  | { kind: "applied" }
  | { kind: "unrecoverable" }
  | { kind: "error" };

/**
 * 処理権が保持したまま反映されていない決済済みセッションを、既存の冪等な反映処理で反映する。
 * 反映によりサブスクのライブ状態がミラー行に書かれ、処理権は解除される（有効な契約なら
 * 会員へ昇格する）。呼び出し元は、昇格しなかった場合（applied）に claim をやり直し、
 * ミラー行の実状態に従って分岐する。
 *
 * 次の場合は自動では反映せず（unrecoverable）、運用者へ通知する。いずれも時間が経っても
 * 変わらない状態で、再試行しても同じ結果になる。
 * - 決済済みセッションが複数ある（1つの処理権では通常起こらない）: 1件目の反映で処理権が
 *   解けた後に2件目の反映が失敗すると、2件目の有効な契約を残したまま次のCheckoutを
 *   作れてしまう（二重契約）
 * - セッションのユーザーが本人と一致しない: 他人の契約を書き込むことになる
 * - セッションに customer / subscription が無い: 反映処理が必ず失敗する
 * - Stripeが恒久的なエラー（サブスクが存在しない等の4xx）を返した
 *
 * @param heldClaimedAt 判定に使った処理権の確保時刻。並行する別リクエストが確保し直した
 * 処理権を、この反映が解除しないようにする（`activateUserFromCheckoutSession()` 参照）
 * @returns activated: 会員へ昇格した / applied: 反映したが昇格はしていない /
 * unrecoverable: 自動では反映しない / error: 一時的な障害で反映できなかった（処理権が
 * 残っていれば次のリクエストで再試行される）
 */
export async function recoverCompletedCheckout(
  userId: number,
  sessions: Stripe.Checkout.Session[],
  heldClaimedAt: string
): Promise<CheckoutRecovery> {
  const sessionIds = sessions.map((session) => session.id);
  const unrecoverable = async (reason: string): Promise<CheckoutRecovery> => {
    console.error(`決済済みCheckoutを自動復旧できません（${reason}）:`, userId, sessionIds);
    await notifyUnrecoverable(userId, reason, sessionIds);
    return { kind: "unrecoverable" };
  };

  if (sessions.length !== 1) {
    return await unrecoverable("決済済みのセッションが複数あります");
  }
  const [session] = sessions;
  // Customerはユーザーごとに一意のため通常は一致する
  if (extractUserId(session.client_reference_id, session.metadata) !== userId) {
    return await unrecoverable("セッションのユーザーが一致しません");
  }
  if (!session.customer || !session.subscription) {
    return await unrecoverable("セッションにcustomer/subscription情報がありません");
  }

  try {
    const result = await activateUserFromCheckoutSession(session, {
      expectedClaimedAt: heldClaimedAt,
    });
    if (result.error) {
      console.error("決済済みCheckoutセッションの反映エラー:", result.error);
      return { kind: "error" };
    }
    return result.activated ? { kind: "activated", sessionId: session.id } : { kind: "applied" };
  } catch (error) {
    if (isPermanentStripeError(error)) {
      return await unrecoverable(`Stripeが処理を拒否しました（${error.statusCode}）`);
    }
    console.error("決済済みCheckoutセッションの反映エラー:", error);
    return { kind: "error" };
  }
}

/**
 * お試しユーザーの Checkout が conflict になったとき、ミラー行に契約が記録されているのに
 * 昇格していない不整合を解消する（`reactivateUserFromMirror()` 参照）。
 * 失敗しても呼び出し元は従来どおり409を返せばよいため、例外は握りつぶして false を返す。
 */
export async function reactivatePaidTrialUser(userId: number): Promise<boolean> {
  try {
    const { error, activated } = await reactivateUserFromMirror(userId);
    if (error) {
      console.error("契約済みユーザーの再昇格エラー:", error);
    }
    return activated;
  } catch (error) {
    console.error("契約済みユーザーの再昇格エラー:", error);
    return false;
  }
}

/**
 * 再試行しても結果が変わらないStripeのエラーか（4xx）。409（同時実行による競合）と
 * 429（レート制限）は時間を置けば通りうるため除く。通信エラー・5xxは一時的な障害とみなす。
 */
function isPermanentStripeError(error: unknown): error is Stripe.errors.StripeError & {
  statusCode: number;
} {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return false;
  }
  const status = error.statusCode;
  return (
    typeof status === "number" && status >= 400 && status < 500 && status !== 409 && status !== 429
  );
}

/**
 * 自動復旧不可を運用者へ通知する。状態が変わらない限りユーザーが押すたびに同じ判定になるため、
 * 同じユーザー・セッションの通知は `RECOVERY_NOTICE_INTERVAL_MINUTES` に1回だけ送る
 * （連打やスクリプトで運用チャンネルを埋めさせない）。重複の判定には `stripe_events` の
 * 一意制約によるclaimを使う（Webhookのイベントidと衝突しない接頭辞のキー）。
 * 判定に失敗した場合は、通知を取りこぼさないよう送る側に倒す。
 */
async function notifyUnrecoverable(
  userId: number,
  reason: string,
  sessionIds: string[]
): Promise<void> {
  let shouldNotify = true;
  try {
    const { claimed, error } = await claimEvent(
      `checkout_recovery_notice:${userId}:${sessionIds.join(",")}`,
      RECOVERY_NOTICE_TYPE,
      RECOVERY_NOTICE_INTERVAL_MINUTES
    );
    if (!error) {
      shouldNotify = claimed;
    }
  } catch (error) {
    console.error("自動復旧不可通知の重複判定エラー:", error);
  }
  if (shouldNotify) {
    await sendSlackCheckoutRecoveryNotification({ userId, reason, sessionIds });
  }
}
