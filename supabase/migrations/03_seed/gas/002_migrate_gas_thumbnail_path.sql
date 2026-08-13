-- #71: 既存のpublic配下のGASサムネイル参照をStorageの相対パスに移行する。
-- 実画像はテーマIDに一致する thumbnails/theme-{id}/thumbnail.png へ別途アップロードする。
UPDATE learning_themes
SET image_url = '/storage/v1/object/public/thumbnails/theme-' || id || '/thumbnail.png?v=1'
WHERE name = 'GAS学習'
  AND image_url = '/images/themes/gas_icon.png';
