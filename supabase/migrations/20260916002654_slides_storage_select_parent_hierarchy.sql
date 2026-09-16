-- =====================================================
-- slides の storage.objects SELECT に親階層の公開判定を追加 (#216)
--
-- 方針A: Storage 側の EXISTS を week / phase / theme への JOIN 付きに拡張し、
-- member / お試しユーザーに対しては `isContentVisible()`（learning-server.ts）と
-- 同じ4階層条件にする。admin / maintainer はプレビューのためロールで無条件許可
-- （仕様 2.12）。learning_contents の SELECT RLS は変更しない（影響範囲を slides に閉じる。
-- 方針Bを採らない理由: お試しユーザー向けの階層骨格表示と進捗/提出 RLS まで波及するため）。
--
-- 適用済みの `20260908000000_secure_slides_bucket.sql` は書き換えない。
-- `(select get_user_role())` で包む・同一操作は OR で1本、の形は維持する。
--
-- `pdf_url` の部分インデックス: EXISTS が hashed SubPlan（カタログ全件 + JOIN）に
-- ならず、相関 SubPlan（キー等値プローブ）を選べるようにする。
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_learning_contents_pdf_url
  ON public.learning_contents (pdf_url)
  WHERE pdf_url IS NOT NULL;

DROP POLICY IF EXISTS "Slides are viewable via visible contents or by content managers" ON storage.objects;
CREATE POLICY "Slides are viewable via visible contents or by content managers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'slides'
    AND (
      (select public.get_user_role()) IN ('admin', 'maintainer')
      OR EXISTS (
        SELECT 1
        FROM public.learning_contents lc
        INNER JOIN public.learning_weeks lw ON lw.id = lc.week_id
        INNER JOIN public.learning_phases lp ON lp.id = lw.phase_id
        INNER JOIN public.learning_themes lt ON lt.id = lp.theme_id
        WHERE lc.pdf_url = storage.objects.name
          AND lc.is_published = true
          AND lc.is_deleted = false
          AND lw.is_published = true
          AND lw.is_deleted = false
          AND lp.is_published = true
          AND lp.is_deleted = false
          AND lt.is_published = true
          AND lt.is_deleted = false
      )
    )
  );
