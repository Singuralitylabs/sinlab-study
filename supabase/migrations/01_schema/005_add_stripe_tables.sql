-- =====================================================
-- Stripe月額サブスク決済用テーブルの追加 (#97)
--
-- stripe_subscriptions: ユーザーごとの課金状態のミラー（1ユーザー1行）。
-- アプリの認可判定は従来どおり users.status / users.membership_type が
-- 唯一の真実であり、このテーブルは Stripe 側の状態を参照可能にするための
-- ミラーに徹する（RLSポリシーは 02_rls/004 で定義）。
--
-- stripe_events: Webhookイベントの冪等性を担保するための処理権（claim）記録。
-- event.id（evt_...）をPKとし、素のINSERTを「claim」として使う原子的排他制御に
-- 用いる（同一event.idの並行配信は一意制約により片方だけがclaimに成功する）。
-- processed_atはclaimした日時（TTL判定・再claim判定に使用）。
-- =====================================================

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  -- Stripeのsubscription.statusをそのままミラーするため、CHECK制約は設けない
  -- （active/trialing/past_due/canceled/unpaid/incomplete等、Stripe側の値追加に追従できるようにする）
  status VARCHAR(30) NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_subscriptions IS
  'ユーザーごとのStripeサブスクリプション状態のミラー。書き込みはWebhook/successページ経由のservice_roleのみ';
COMMENT ON COLUMN stripe_subscriptions.status IS
  'Stripeのsubscription.statusをそのままミラー（例: active, past_due, canceled, unpaid）';

DROP TRIGGER IF EXISTS update_stripe_subscriptions_updated_at ON stripe_subscriptions;
CREATE TRIGGER update_stripe_subscriptions_updated_at
  BEFORE UPDATE ON stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY, -- Stripe event.id（evt_...）
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_events IS
  'Webhookイベントの冪等性担保用。event.idへの素のINSERTを処理権のclaimとして使う（一意制約による排他制御）。processed_atはTTL判定にも使用';
