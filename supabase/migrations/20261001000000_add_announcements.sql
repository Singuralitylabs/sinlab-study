-- =====================================================
-- お知らせ機能 announcements / announcement_reads を追加 (#254)
--
-- 運営（admin / maintainer）から受講生へのお知らせ。アプリ内（ダッシュボード・
-- /announcements）に表示し、send_email = true なら Cron の日次バッチ
-- （GET /api/cron/email-digest）がメールでも一斉送信する（分割送信。対象者全員に
-- 送り終えた時点で email_sent_at を記録する）。
--
-- 対象の絞り込み:
--   target_statuses          … 対象ステータス（active / trial の1つ以上）
--   target_membership_types  … 対象会員種別（NULL は全種別）。お試しユーザーは
--                               membership_type が NULL のため、種別を指定した
--                               お知らせは見えない（ステータスと種別の両方が一致した
--                               ユーザーだけが対象）
--
-- RLS:
--   announcements の SELECT は「公開済み・未削除かつ自分のステータス・会員種別が
--   対象に含まれる」もの、または admin / maintainer（管理画面）。
--   INSERT / UPDATE / DELETE は admin / maintainer。
--   announcement_reads は本人の行のみ INSERT / SELECT（INSERT は自分に見える
--   お知らせに限る）。UPDATE / DELETE のポリシーは作らない。
--   ポリシーは (select get_user_xxx()) で包み、同一操作は OR で1本にまとめる。
-- =====================================================

-- 会員種別の参照用ヘルパー（get_user_status() と同じ規約）
CREATE OR REPLACE FUNCTION public.get_user_membership_type()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT membership_type::text FROM users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_membership_type() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_membership_type() TO authenticated, service_role;

-- =====================================================
-- announcements
-- =====================================================

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body TEXT NOT NULL,
  target_statuses TEXT[] NOT NULL
    CHECK (cardinality(target_statuses) > 0 AND target_statuses <@ ARRAY['active', 'trial']::TEXT[]),
  target_membership_types TEXT[]
    CHECK (
      target_membership_types IS NULL
      OR (
        cardinality(target_membership_types) > 0
        AND target_membership_types <@ ARRAY['community', 'general']::TEXT[]
      )
    ),
  published_at TIMESTAMPTZ,
  send_email BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE announcements IS
  '運営から受講生へのお知らせ。published_at が NULL なら下書き。send_email なら Cron のバッチがメールでも一斉送信する';
COMMENT ON COLUMN announcements.body IS 'Markdown 本文（表示は生 HTML を描画しない react-markdown）';
COMMENT ON COLUMN announcements.target_statuses IS '対象ステータス（active / trial の1つ以上）';
COMMENT ON COLUMN announcements.target_membership_types IS
  '対象会員種別（community / general）。NULL は全種別。種別を指定するとお試しユーザー（種別 NULL）には見えない';
COMMENT ON COLUMN announcements.published_at IS '公開日時。NULL は下書き';
COMMENT ON COLUMN announcements.email_sent_at IS
  'メールの一斉送信を対象者全員に送り終えた日時。NULL のうちは Cron のバッチが分割送信を続ける';

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 受講生向けの一覧（公開済み・未削除を新しい順）と Cron の送信待ちの抽出向け
CREATE INDEX IF NOT EXISTS idx_announcements_published
  ON announcements (published_at DESC)
  WHERE published_at IS NOT NULL AND is_deleted = false;

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcements are viewable by targeted users or content managers" ON announcements;
CREATE POLICY "Announcements are viewable by targeted users or content managers"
  ON announcements FOR SELECT TO authenticated
  USING (
    (
      published_at IS NOT NULL
      AND is_deleted = false
      AND (select get_user_status()) = ANY (target_statuses)
      AND (
        target_membership_types IS NULL
        OR (select get_user_membership_type()) = ANY (target_membership_types)
      )
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can insert announcements" ON announcements;
CREATE POLICY "Content managers can insert announcements"
  ON announcements FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Content managers can update announcements" ON announcements;
CREATE POLICY "Content managers can update announcements"
  ON announcements FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'))
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Content managers can delete announcements" ON announcements;
CREATE POLICY "Content managers can delete announcements"
  ON announcements FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));

-- =====================================================
-- announcement_reads
-- =====================================================

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

COMMENT ON TABLE announcement_reads IS 'お知らせの既読。詳細を開いたときに本人が記録する（1人1お知らせ1行）';

-- 本人の既読一覧（未読件数の算出）向け
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON announcement_reads (user_id);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own announcement reads" ON announcement_reads;
CREATE POLICY "Users can view own announcement reads"
  ON announcement_reads FOR SELECT TO authenticated
  USING (user_id = (select get_user_id()));

-- 自分に見えるお知らせに限る（EXISTS のサブクエリには announcements の RLS が適用される）
DROP POLICY IF EXISTS "Users can insert own reads of visible announcements" ON announcement_reads;
CREATE POLICY "Users can insert own reads of visible announcements"
  ON announcement_reads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select get_user_id())
    AND EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.id = announcement_reads.announcement_id
        AND a.published_at IS NOT NULL
        AND a.is_deleted = false
    )
  );
