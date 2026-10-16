-- content-images への書き込みはコンテンツ管理者に限定する（#376）
-- 公開バケットのため SELECT ポリシーは置かない（public URL で参照）。

DROP POLICY IF EXISTS "Content managers can upload content images" ON storage.objects;
CREATE POLICY "Content managers can upload content images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can update content images" ON storage.objects;
CREATE POLICY "Content managers can update content images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  )
  WITH CHECK (
    bucket_id = 'content-images'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can delete content images" ON storage.objects;
CREATE POLICY "Content managers can delete content images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );
