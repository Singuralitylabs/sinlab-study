-- =====================================================
-- learning_phases に付録フラグ is_appendix を追加 (#556)
--
-- 付録のフェーズ（内容を差し替える前提の、記事だけの回など）は、テーマの修了判定・進捗率の
-- 対象外にする。集計側はアプリの applyMainCourseNestedThemeFilters() がこの列で絞る。
-- 既定は false（本編）なので、既存のフェーズの扱いは変わらない。
-- learning_phases はテーブル単位の権限（列 GRANT を使っていない）のため、追加の GRANT は不要。
-- RLS は公開判定（is_published / is_deleted）のままで変えない。
-- =====================================================

ALTER TABLE public.learning_phases
  ADD COLUMN IF NOT EXISTS is_appendix BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.learning_phases.is_appendix IS
  '付録のフェーズなら true。テーマの修了判定・進捗率・続きから学習の対象外で、画面では本編の後ろに「付録」として分けて表示する';
