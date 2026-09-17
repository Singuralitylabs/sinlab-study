-- =====================================================
-- learning_contents.pdf_url のオブジェクトキー検証を強化 (#217)
--
-- `20260908000000_secure_slides_bucket.sql` の適用中断チェックは
-- スキーム付きURLと `/` 始まりしか見ておらず、空セグメントや `.` / `..` を含む
-- キー（例: `gas//slide-01.pdf`, `gas/../slide-01.pdf`）を素通ししていた。
-- 残すと Storage ポリシーの等値比較が成立せず、当該スライドだけ署名不能になる。
--
-- 本マイグレーションは適用済みの `20260908000000` を書き換えず、
--   1. 同ファイルと同じ規則で `pdf_url` を再正規化し（旧公開URL・前後空白）、
--   2. アプリ側 `toSlideObjectKey()`（`app/lib/slide-object-key.ts`）と同じ拒否条件で
--      再検査し、該当行があれば例外で中断する。
-- 1 を先に行うことで、正規化すれば有効になる保存値（旧接頭辞・前後空白）も
-- Storage の `pdf_url = storage.objects.name` 等値比較を満たす形へ直す。
--
-- 拒否条件（正規化後の key に対して）:
--   - 空文字
--   - `/` 始まり
--   - スキーム付き（`^[a-z][a-z0-9+.-]*:`、大小無視）
--   - 空セグメント / `.` / `..` セグメント
--
-- テスト（`tests/lib/slide-object-key-sql-parity.test.ts`）が本ファイルの
-- 正規化式・判定式と JS 側の突き合わせを担保する。式を変えるときはテスト定数も更新すること。
-- =====================================================

-- 正規化式はサブクエリで1回だけ書き、SET と WHERE で同じ値を参照する
-- （式を片方だけ直して WHERE が一致しなくなる事故を防ぐ）。
-- 式本文は検証 DO ブロックおよび tests/lib/slide-object-key-sql-parity.test.ts の
-- SLIDE_PDF_URL_SQL_NORMALIZE_EXPR と同一であること。
UPDATE public.learning_contents lc
SET pdf_url = n.normalized
FROM (
  SELECT
    id,
    regexp_replace(
      btrim(pdf_url, E' \t\r\n'),
      '^(https?://[^/]+)?/storage/v1/object/public/slides/',
      ''
    ) AS normalized
  FROM public.learning_contents
  WHERE pdf_url IS NOT NULL
) n
WHERE lc.id = n.id
  AND lc.pdf_url <> n.normalized;

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM (
    SELECT
      regexp_replace(
      btrim(pdf_url, E' \t\r\n'),
      '^(https?://[^/]+)?/storage/v1/object/public/slides/',
      ''
    ) AS key
    FROM public.learning_contents
    WHERE pdf_url IS NOT NULL
  ) n
  WHERE
    n.key = ''
    OR n.key ~ '^/'
    OR n.key ~* '^[a-z][a-z0-9+.-]*:'
    OR EXISTS (
      SELECT 1
      FROM unnest(string_to_array(n.key, '/')) AS segment
      WHERE segment IN ('', '.', '..')
    );

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'learning_contents.pdf_url にオブジェクトキーとして解釈できない値が % 件あります。手動で修正してから再適用してください',
      bad_count;
  END IF;
END $$;
