-- =====================================================
-- Stripeテーブル向けRLSポリシー (#97)
--
-- stripe_subscriptions: SELECTのみ「本人 or admin」に許可する。
-- 昇格・降格を伴う書き込み（INSERT/UPDATE/DELETE）はアプリ側の認可判定と
-- 密結合しているため、service_role（Webhook / successページ）経由のみに限定し、
-- 通常ユーザー向けの書き込みポリシーは作成しない。
--
-- stripe_events: service_role専用（RLSを有効化するのみでポリシーは作成しない）。
-- 既存のSECURITY DEFINERヘルパー（get_user_id() / get_user_role()）と
-- (select fn()) の呼び出し規約（auth_rls_initplan対策）に従う。
-- =====================================================

ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription, admins can view all" ON stripe_subscriptions;
CREATE POLICY "Users can view own subscription, admins can view all"
  ON stripe_subscriptions FOR SELECT TO authenticated
  USING (
    user_id = (select get_user_id())
    OR (select get_user_role()) = 'admin'
  );
