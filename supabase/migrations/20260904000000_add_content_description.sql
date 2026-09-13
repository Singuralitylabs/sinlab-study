-- =====================================================
-- learning_contents に概要カラム description を追加 (#66)
--
-- 動画・スライドページで「何を学べるか」を一目で把握できるよう、
-- コンテンツ詳細ページのプレイヤー／ビューア上部に表示する概要欄用のカラム。
-- NULL可・任意入力とし、既存コンテンツとの後方互換を保つ（未入力時は概要欄を非表示にする）。
-- ADD COLUMN IF NOT EXISTS のため再実行しても安全。
-- =====================================================

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.learning_contents.description IS
  'コンテンツ概要（Markdown）。video / slide の詳細ページでプレイヤー／ビューア上部に表示する。NULL可・任意入力で、未入力時は概要欄カードを表示しない';
