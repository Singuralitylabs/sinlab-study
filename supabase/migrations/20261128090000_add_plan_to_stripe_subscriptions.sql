-- =====================================================
-- stripe_subscriptions に契約中の Price（price_id）と請求間隔（billing_interval）を追加（#290）
--
-- 年額プランの追加に伴い、/upgrade の契約中表示と /admin/users の契約中バッジで
-- 月額・年額を出し分けるため、Stripe の subscription.items[0].price の id と
-- recurring.interval（month / year）をミラーする。
-- 表示は billing_interval から出す。price_id を環境変数と突き合わせる方式だと、
-- 料金改定で Price を作り直したときに旧契約のプランが分からなくなるため。
--
-- 列の追加のみで既存行は NULL のまま（表示はプラン種別なし）。次のサブスク更新Webhook等で
-- ライブ状態が書き込まれる。RLS は行単位の SELECT ポリシーのみのため変更不要。
--
-- アプリより先に適用すること（未適用のままミラー書き込みに新しい列を含めると
-- Webhook・successページの反映が失敗する）。
-- =====================================================

ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS price_id TEXT;
ALTER TABLE stripe_subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT;

COMMENT ON COLUMN stripe_subscriptions.price_id IS
  'Stripe の subscription.items[0].price.id のミラー。未記録なら NULL';
COMMENT ON COLUMN stripe_subscriptions.billing_interval IS
  'Stripe の subscription.items[0].price.recurring.interval（month / year）のミラー。未記録なら NULL';
