-- =====================================================
-- 兄弟要素の display_order 一括更新 RPC (#196)
--
-- applySiblingUpdates() は従来、変化した兄弟行ごとに
-- `.update({ display_order }).eq("id", ...)` を Promise.all で発行していた。
-- 挿入位置指定（#190 / #191）で呼ばれるため、兄弟数に比例して N 往復 +
-- N 回の RLS 評価になる。
--
-- 本 RPC は `id` / `display_order` の配列を受け取り、1 回の UPDATE ... FROM
-- でまとめて更新する。upsert ではなく純粋な UPDATE のみなので:
--   - INSERT 経路に乗らない（必須カラム欠落や誤 INSERT が起きない）
--   - `updated_at` の BEFORE UPDATE トリガーが通常どおり発火する
--   - SECURITY INVOKER のため呼び出し元の RLS UPDATE ポリシーに従う
--     （admin/maintainer の通常クライアント、または service_role）
-- =====================================================

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
    'learning_weeks',
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

REVOKE EXECUTE ON FUNCTION public.bulk_update_sibling_display_order(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_sibling_display_order(text, jsonb) TO authenticated, service_role;
