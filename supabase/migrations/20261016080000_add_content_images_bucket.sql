-- =====================================================
-- content-images 公開バケット（#376）
--
-- テキスト / スライド解説記事の Markdown 向け画像。公開バケット
-- （知っていれば誰でも閲覧可。説明用の図を想定）。
-- キー規約: content-{contentId}/<randomId>.{ext}
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  5242880, -- 5 MiB（アップロード API と同じ上限）
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
