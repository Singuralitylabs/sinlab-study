-- 講師（maintainer）が全提出物を閲覧可能にするポリシー
DROP POLICY IF EXISTS "Maintainers can view all submissions" ON submissions;
CREATE POLICY "Maintainers can view all submissions"
  ON submissions FOR SELECT TO authenticated
  USING (get_user_role() = 'maintainer');
