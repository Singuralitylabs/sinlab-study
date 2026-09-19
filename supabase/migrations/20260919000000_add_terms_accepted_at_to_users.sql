-- =====================================================
-- users に利用規約の同意日時カラムを追加 (#226)
--
-- 初回ログイン時の利用規約・プライバシーポリシーへの同意を
-- 初回登録時のタイムスタンプとして記録する。
-- 新規登録ユーザーのみが対象で、既存ユーザーは NULL のまま
-- 利用継続できる（再同意は求めない）。
--
-- RLS の変更は不要（INSERT ポリシーは auth_id = auth.uid() のみを検査）。
-- 稼働中DB・新規セットアップの双方に対して、このファイルが
-- terms_accepted_at カラムの唯一の定義箇所となる。
-- ADD COLUMN IF NOT EXISTS により、複数回適用しても安全。
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.terms_accepted_at IS
  '利用規約・プライバシーポリシーへの同意日時。初回登録時に記録し、既存ユーザーは NULL のまま';
