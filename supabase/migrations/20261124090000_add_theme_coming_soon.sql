-- =====================================================
-- 準備中テーマの coming soon 表示 (#593)
--
-- learning_themes.is_coming_soon: 未公開のテーマを、受講者の学習コンテンツ一覧に
-- 「coming soon...」として見出しだけ並べるかどうか。公開済みの行では無視する。
--
-- 受講者は RLS で未公開テーマを読めない（docs/database.md 5章）。RLS を広げると
-- フェーズ・コンテンツの取得や進捗の集計にも未公開テーマが混ざるため、見出しだけを
-- 返す get_coming_soon_themes() を別に用意する。返す列は id / name / description /
-- image_url / display_order だけで、フェーズ・コンテンツは返さない。
-- =====================================================

ALTER TABLE public.learning_themes
  ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.learning_themes.is_coming_soon IS
  '未公開の間、学習コンテンツ一覧に準備中（coming soon）として見出しだけ表示するか。公開済みでは無視する';

CREATE OR REPLACE FUNCTION public.get_coming_soon_themes()
RETURNS TABLE (
  id INTEGER,
  name TEXT,
  description TEXT,
  image_url TEXT,
  display_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Same status gate as the (authenticated) layout: rejected / unregistered callers see nothing.
  SELECT t.id, t.name::text, t.description, t.image_url, t.display_order
  FROM public.learning_themes t
  WHERE t.is_coming_soon = true
    AND t.is_published IS NOT TRUE
    AND t.is_deleted = false
    AND (SELECT public.get_user_status()) IN ('active', 'trial')
  ORDER BY t.display_order, t.id;
$$;

-- Supabase's default privileges grant EXECUTE to anon and authenticated
-- explicitly, so revoking from PUBLIC alone is not enough.
REVOKE ALL ON FUNCTION public.get_coming_soon_themes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coming_soon_themes() TO authenticated, service_role;
