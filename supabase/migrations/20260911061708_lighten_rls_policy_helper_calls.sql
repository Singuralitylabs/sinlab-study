-- =====================================================
-- RLS ポリシーのヘルパー呼び出し軽量化 (#197 PR2)
--
-- 1. learning_contents の SELECT ポリシーで get_user_status() を
--    構文上 2 回呼んでいたため、CASE (select get_user_status()) で
--    InitPlan を 1 本に折り畳む。(select ...) を複数回書くと Postgres は
--    別の InitPlan になり各 1 回評価される（共有されない）。節約されるのは
--    1 ステートメントあたり users の PK 探索 1 回（行ごとではない）。
--    許可・拒否の真理値は変更前と同一（trial × is_open_to_trial の 4 通り、
--    rejected、admin/maintainer のロールバイパスを含む）。
--
-- 2. ai_reviews の SELECT ポリシーで、無相関の
--    submission_id IN (SELECT ...) を相関 EXISTS に書き換える。
--    旧形の無相関 IN は hashed SubPlan としてクエリあたり 1 回評価され、
--    内側の (select get_user_id()) も既に InitPlan だった。相関 EXISTS に
--    することで、広いスキャンでは同様の hashed SubPlan、点検索では
--    submissions_pkey プローブも選べるようにする（真理値は同一）。
--
-- CLAUDE.md の規約（(select get_user_xxx()) で包む / 同一操作は OR で 1 本）
-- と、ヘルパーの GRANT/REVOKE・関数本体は変更しない。
-- =====================================================

DROP POLICY IF EXISTS "Contents are viewable by users or content managers" ON learning_contents;
CREATE POLICY "Contents are viewable by users or content managers"
  ON learning_contents FOR SELECT TO authenticated
  USING (
    (
      is_published = true AND is_deleted = false
      AND CASE (select get_user_status())
        WHEN 'active' THEN true
        WHEN 'trial' THEN is_open_to_trial
        ELSE false
      END
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Users can view own ai reviews, managers can view all" ON ai_reviews;
CREATE POLICY "Users can view own ai reviews, managers can view all"
  ON ai_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM submissions s
      WHERE s.id = ai_reviews.submission_id
        AND s.user_id = (select get_user_id())
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );
