-- =====================================================
-- Checkout作成の並行実行を排他するための列追加 (#103)
--
-- 従来 `POST /api/stripe/checkout` の二重Checkout防止は「ミラー行が既に
-- 存在するか」の素のSELECTだけで、決済完了前は行が無いため同一ユーザーの
-- 並行リクエストを止められなかった（二重契約・二重課金）。
--
-- `user_id` のUNIQUE制約を排他制御に使い、Stripe呼び出しの**前に**
-- 「決済手続き中」行（status = 'checkout_pending'）をINSERTして処理権を
-- 確保する方式へ変更する（`stripe_events` のclaim/releaseと同じパターン）。
--
-- これに伴い以下の2点を変更する。
--   1. `stripe_customer_id` をNULL許容にする。処理権の確保はStripe呼び出しより
--      前に行うため、claim時点ではCustomerがまだ存在しない
--      （UNIQUE制約はNULLを重複とみなさないため一意性は維持される）
--   2. claimの保持時刻を記録する `checkout_claimed_at` を追加する。
--      NULL = claimなし（解放済み・契約記録済み）、値あり = 手続き中。
--      放置されたclaimはTTL経過後に奪い直せる（`stripe_events` と同じ救済）
--   3. claimが確保したCheckout Sessionを記録する `checkout_session_id` を追加する。
--      次のリクエストが「その手続きがまだ有効か」をStripeに問い合わせ、
--      open ならURLを再利用、expired なら奪取、complete なら待機、と判断できるようにする
--      （TTLだけに頼ると、中断したユーザーがTTLまで締め出される・決済済みで反映待ちの行を
--      奪ってしまう、という問題が残る）
-- =====================================================

ALTER TABLE stripe_subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;

ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS checkout_claimed_at TIMESTAMPTZ;

ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS checkout_session_id TEXT;

COMMENT ON TABLE stripe_subscriptions IS
  'ユーザーごとのStripeサブスクリプション状態のミラー。書き込みはservice_roleのみ（Webhook/successページの昇格処理と、Checkout作成APIによる処理権のclaim/release）';
COMMENT ON COLUMN stripe_subscriptions.stripe_customer_id IS
  'ユーザーごとに一意なStripe Customer。Checkout作成時に確保し以後は必ず再利用する（孤児Customer＝Portalから解約できない契約を作らないため）。claim直後〜Customer作成前のみNULL';
COMMENT ON COLUMN stripe_subscriptions.status IS
  'Stripeのsubscription.statusをそのままミラー（例: active, past_due, canceled, unpaid）。ただしCheckout作成の処理権を確保している間だけは番兵値 checkout_pending が入る（Stripe側には存在しない値）';
COMMENT ON COLUMN stripe_subscriptions.checkout_claimed_at IS
  'Checkout作成の処理権を確保した日時。NULLは処理権なし。TTL経過後は他リクエストが奪い直せる';
COMMENT ON COLUMN stripe_subscriptions.checkout_session_id IS
  '処理権が確保しているCheckout Session（cs_...）。次のリクエストがStripeで有効性を確認し、再利用・奪取・待機を判断するために保持する';
