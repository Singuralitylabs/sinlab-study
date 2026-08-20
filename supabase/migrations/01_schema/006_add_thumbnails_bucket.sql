-- 学習テーマのサムネイルを管理画面からアップロードするための公開バケット (#71)
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
