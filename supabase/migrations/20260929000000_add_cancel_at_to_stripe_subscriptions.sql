-- =====================================================
-- stripe_subscriptions に解約予定日時 cancel_at を追加
--
-- flexible billing mode（Stripe API 2025-09-30.clover 以降の新規サブスクの既定）では、
-- Customer Portal での解約は Subscription の cancel_at に終了日時を設定し、
-- cancel_at_period_end は false のままになる。cancel_at_period_end だけをミラーしていると
-- /upgrade が解約予約を検知できず「次回のお支払い」を表示し続けるため、cancel_at もミラーする。
--
-- 解約予約中かどうかの判定は「cancel_at_period_end = true または cancel_at IS NOT NULL」、
-- 利用期限は「cancel_at、無ければ current_period_end」（app/lib/subscription-period.ts）。
-- 列の追加のみで既存行は NULL（= cancel_at 未設定）のまま。次のサブスク更新Webhook等で
-- ライブ状態が書き込まれる。RLS は行単位の SELECT ポリシーのみのため変更不要。
--
-- アプリより先に適用すること（未適用のままミラー書き込みに cancel_at を含めると
-- Webhook・successページの反映が失敗する）。
-- =====================================================

ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ;

COMMENT ON COLUMN stripe_subscriptions.cancel_at IS
  'Stripe の subscription.cancel_at（解約予定日時）のミラー。未設定なら NULL';
