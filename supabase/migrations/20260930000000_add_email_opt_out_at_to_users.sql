-- =====================================================
-- users に案内メールの配信停止日時カラムを追加 (#253)
--
-- 定期メール（週次進捗・未学習リマインド・お試しユーザー向け案内）の
-- 配信停止を記録する。GET /api/email/unsubscribe（署名付きリンク、
-- ログイン不要）が service_role 経由で now() を書き込み、Cron の送信対象
-- 抽出で email_opt_out_at IS NULL のユーザーだけに絞る。
-- トランザクションメール（登録・承認・有料会員化・解約）は対象外で、
-- このカラムを参照しない。再開は管理者が NULL に戻す。
--
-- RLS の変更は不要（書き込みは service_role のみ。本人 SELECT は既存
-- ポリシーで許可済みで、本人による UPDATE は RLS で許可していない）。
-- 既存ユーザーは NULL（配信対象）のまま。
-- ADD COLUMN IF NOT EXISTS により、複数回適用しても安全。
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.email_opt_out_at IS
  '案内メール（定期メール・お知らせ）の配信停止日時。NULL は配信対象。トランザクションメールには影響しない';
