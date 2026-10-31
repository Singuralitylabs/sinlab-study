-- =====================================================
-- 学習コンテンツ階層から「週」を廃止する (#426)
--
-- テーマ → フェーズ → 週 → コンテンツ を、テーマ → フェーズ → コンテンツ にする。
-- learning_contents.phase_id を追加して移行し、week_id と learning_weeks を削除する。
--
-- 破壊的変更（テーブル削除）。本番反映前に Wiki の本番環境リリース手順に従うこと。
--
-- 移行で失わないもの:
--   - 週の公開・削除フラグ: 週が未公開・削除済みならコンテンツ側へ畳み込む。畳み込まないと、
--     週ごと非公開にしていたコンテンツがフェーズ直下で公開されてしまう。
--   - 学習順: 旧順序（週の順 → 週内の順）をフェーズ内の 1 からの連番にする。
--     論理削除された行は末尾に回し、有効な行の番号を詰める。
-- =====================================================

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS phase_id INTEGER REFERENCES public.learning_phases(id) ON DELETE CASCADE;

UPDATE public.learning_contents lc
SET phase_id = lw.phase_id
FROM public.learning_weeks lw
WHERE lw.id = lc.week_id
  AND lc.phase_id IS NULL;

UPDATE public.learning_contents lc
SET is_published = false
FROM public.learning_weeks lw
WHERE lw.id = lc.week_id
  AND lw.is_published = false
  AND lc.is_published = true;

UPDATE public.learning_contents lc
SET is_deleted = true
FROM public.learning_weeks lw
WHERE lw.id = lc.week_id
  AND lw.is_deleted = true
  AND lc.is_deleted = false;

WITH ordered AS (
  SELECT
    lc.id,
    row_number() OVER (
      PARTITION BY lc.phase_id
      ORDER BY
        lc.is_deleted,
        lw.display_order NULLS LAST,
        lw.id,
        lc.display_order NULLS LAST,
        lc.id
    ) AS new_order
  FROM public.learning_contents lc
  INNER JOIN public.learning_weeks lw ON lw.id = lc.week_id
)
UPDATE public.learning_contents lc
SET display_order = ordered.new_order
FROM ordered
WHERE ordered.id = lc.id
  AND lc.display_order IS DISTINCT FROM ordered.new_order;

ALTER TABLE public.learning_contents
  ALTER COLUMN phase_id SET NOT NULL;

DROP INDEX IF EXISTS public.idx_learning_contents_phase_id;
CREATE INDEX idx_learning_contents_phase_id
  ON public.learning_contents (phase_id, display_order);

-- ---------- week を JOIN していたオブジェクトを phase 直結に作り直す ----------

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
        INNER JOIN public.learning_phases lp ON lp.id = lc.phase_id
        INNER JOIN public.learning_themes lt ON lt.id = lp.theme_id
        WHERE lc.pdf_url = storage.objects.name
          AND lc.is_published = true
          AND lc.is_deleted = false
          AND lp.is_published = true
          AND lp.is_deleted = false
          AND lt.is_published = true
          AND lt.is_deleted = false
      )
    )
  );

-- Same signature and ACL as before (CREATE OR REPLACE keeps the revoked grants).
CREATE OR REPLACE FUNCTION public.content_visible_to_caller(p_content_id INTEGER, p_content_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learning_contents lc
    INNER JOIN learning_phases lp ON lp.id = lc.phase_id
    INNER JOIN learning_themes lt ON lt.id = lp.theme_id
    WHERE lc.id = p_content_id
      AND lc.content_type = p_content_type
      AND lc.is_deleted = false
      AND (
        get_user_role() IN ('admin', 'maintainer')
        OR (
          lc.is_published = true
          AND lp.is_published = true AND lp.is_deleted = false
          AND lt.is_published = true AND lt.is_deleted = false
          AND CASE get_user_status()
            WHEN 'active' THEN true
            WHEN 'trial' THEN lc.is_open_to_trial
            ELSE false
          END
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_sibling_display_order(
  p_table text,
  p_updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_table IS NULL OR p_table NOT IN (
    'learning_themes',
    'learning_phases',
    'learning_contents'
  ) THEN
    RAISE EXCEPTION 'unsupported table for bulk_update_sibling_display_order: %', p_table;
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array';
  END IF;

  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  EXECUTE format(
    $f$
      UPDATE public.%I AS t
      SET display_order = v.display_order
      FROM (
        SELECT
          (elem->>'id')::integer AS id,
          (elem->>'display_order')::integer AS display_order
        FROM jsonb_array_elements($1) AS elem
      ) AS v
      WHERE t.id = v.id
    $f$,
    p_table
  )
  USING p_updates;
END;
$$;

-- ---------- 受講生向け列権限（week_id → phase_id） ----------

REVOKE SELECT ON TABLE public.learning_contents FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  allowed_submission_types,
  code_language,
  content_type,
  created_at,
  description,
  display_order,
  exercise_instructions,
  has_grading_requirements,
  hint,
  id,
  is_deleted,
  is_open_to_trial,
  is_published,
  pdf_url,
  phase_id,
  preview_base_html,
  show_console,
  show_preview,
  starter_files,
  submission_file_slots,
  text_content,
  title,
  updated_at,
  video_url
) ON TABLE public.learning_contents TO anon, authenticated;

-- ---------- 週の削除 ----------

ALTER TABLE public.learning_contents DROP COLUMN week_id;

DROP TABLE public.learning_weeks;
