-- =====================================================
-- learning_contents SELECTポリシー: 比較値を 'pending' → 'trial' に更新 (#88)
--
-- 20260907010000_rename_pending_status_to_trial.sql で users.status の値を
-- 'pending' から 'trial' にリネームしたため、get_user_status() の返り値と
-- 比較する20260801000002_trial_user_policies.sqlのポリシー側リテラルも追従させる。
-- get_user_status() 自体は status カラムをそのまま返すのみで変更不要。
-- =====================================================

DROP POLICY IF EXISTS "Contents are viewable by users or content managers" ON learning_contents;
CREATE POLICY "Contents are viewable by users or content managers"
  ON learning_contents FOR SELECT TO authenticated
  USING (
    (
      is_published = true AND is_deleted = false
      AND (
        (select get_user_status()) = 'active'
        OR ((select get_user_status()) = 'trial' AND is_open_to_trial = true)
      )
    )
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );
