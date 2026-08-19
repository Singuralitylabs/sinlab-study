-- thumbnailsバケットへの書き込みはコンテンツ管理者に限定する (#71)
DROP POLICY IF EXISTS "Content managers can upload thumbnails" ON storage.objects;
CREATE POLICY "Content managers can upload thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can update thumbnails" ON storage.objects;
CREATE POLICY "Content managers can update thumbnails"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  )
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can delete thumbnails" ON storage.objects;
CREATE POLICY "Content managers can delete thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'thumbnails'
    AND (select get_user_role()) IN ('admin', 'maintainer')
  );
