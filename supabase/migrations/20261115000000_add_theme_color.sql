-- =====================================================
-- learning_themes.theme_color を追加 (#557)
--
-- 修了証の配色をテーマのサムネイルの背景色に合わせるための色（#RRGGBB）。
-- NULL は未設定で、修了証は従来の theme_id で選ぶパレットのまま（既存行は NULL）。
-- 本番と開発で theme_id が違うため、色の UPDATE はここに書かず /manage で登録する。
-- 形式の正はアプリの THEME_COLOR_PATTERN（app/lib/theme-color.ts）で、ここと揃える。
-- ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS のため再実行しても安全。
-- =====================================================

ALTER TABLE public.learning_themes
  ADD COLUMN IF NOT EXISTS theme_color TEXT;

ALTER TABLE public.learning_themes
  DROP CONSTRAINT IF EXISTS learning_themes_theme_color_check;

ALTER TABLE public.learning_themes
  ADD CONSTRAINT learning_themes_theme_color_check
  CHECK (theme_color IS NULL OR theme_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.learning_themes.theme_color IS
  'テーマカラー（#RRGGBB）。サムネイル画像の背景色。修了証の配色に使い、NULL のときは theme_id で選ぶ既定のパレット';
