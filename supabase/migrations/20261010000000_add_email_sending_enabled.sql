-- =====================================================
-- メール送信の全体スイッチ (#315)
--
-- email_settings.sending_enabled: 受講生向けメール（トランザクション系・定期メール）を送るかどうか。
--   既定は false。利用規約の改定が終わるまで本番で一通も送らないため、環境変数
--   （RESEND_API_KEY 等）を設定してあっても、管理者が管理画面で有効にするまで送らない。
--   送信側は service_role で読み、読めなければ送らない（フェイルクローズ）。
--   種別ごとの email_kind_settings.enabled とは独立で、全体 → 種別の順に確認する。
-- email_settings.sending_updated_at / sending_updated_by: 切り替えの記録。
--   updated_at（1日の上限）・service_updated_at（サービス名）とは別に持つ。
--
-- RLS は既存のポリシー（SELECT / UPDATE とも admin のみ）がそのまま効く。
-- =====================================================

ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS sending_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sending_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sending_updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.email_settings.sending_enabled IS
  '受講生向けメール送信の全体スイッチ。false の間は種別の設定に関わらず送らない（管理者本人へのテスト送信は除く）。読めなければ送らない';
COMMENT ON COLUMN public.email_settings.sending_updated_at IS
  '全体スイッチの最終更新日時。NULL は未操作（既定の無効のまま）';
COMMENT ON COLUMN public.email_settings.sending_updated_by IS '全体スイッチを最後に切り替えた users.id';
