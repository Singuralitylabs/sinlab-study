-- =====================================================
-- users に会員種別カラムを追加 (#87)
--
-- 承認後のユーザーを「コミュニティ会員（community）」と
-- 「一般有料会員（general）」に分類する。
-- 承認前（status='pending'）・却下（status='rejected'）は NULL のままとする
-- （CHECK 制約は NULL を許容するため、NOT NULL は付けない）。
--
-- 稼働中DB・新規セットアップの双方に対して、このファイルが membership_type カラムの
-- 唯一の定義箇所となる（スキーマ定義ファイル 001 は確定履歴として変更しない方針）。
-- ADD COLUMN IF NOT EXISTS + 制約の存在チェック + 冪等な UPDATE により、
-- 複数回適用しても安全。
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS membership_type VARCHAR(20);

-- ADD COLUMN IF NOT EXISTS では既存カラムに CHECK 制約が付かないため、別途追加する
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'users_membership_type_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_membership_type_check
      CHECK (membership_type IN ('community', 'general'));
  END IF;
END $$;

COMMENT ON COLUMN users.membership_type IS
  '会員種別。community（コミュニティ会員）/ general（一般有料会員）。承認前・却下ユーザーは NULL';

-- 既存の承認済みユーザーはコミュニティ会員としてバックフィルする
-- （未設定の行のみが対象のため、再実行しても既存の設定を上書きしない）
UPDATE users
SET membership_type = 'community'
WHERE status = 'active'
  AND membership_type IS NULL;
