-- =====================================================
-- learning_contents.pdf_url のオブジェクトキー検証を強化 (#217)
--
-- `20260908000000_secure_slides_bucket.sql` の適用中断チェックは
-- スキーム付きURLと `/` 始まりしか見ておらず、空セグメントや `.` / `..` を含む
-- キー（例: `gas//slide-01.pdf`, `gas/../slide-01.pdf`）を素通ししていた。
-- 残すと Storage ポリシーの等値比較が成立せず、当該スライドだけ署名不能になる。
--
-- 本マイグレーションは適用済みの `20260908000000` を書き換えず、
-- アプリ側 `toSlideObjectKey()`（`app/lib/slide-object-key.ts`）と同じ規則
-- （前後の空白・タブ・CR・LF 除去 → 旧公開URL接頭辞の除去 → 拒否条件）で
-- 再検査し、該当行があれば例外で中断する。
--
-- 拒否条件（正規化後の key に対して）:
--   - 空文字
--   - `/` 始まり
--   - スキーム付き（`^[a-z][a-z0-9+.-]*:`、大小無視）
--   - 空セグメント / `.` / `..` セグメント
--
-- テスト（`tests/lib/slide-object-key-sql-parity.test.ts`）が本ファイルの
-- 判定式と JS 側の突き合わせを担保する。式を変えるときはテスト定数も更新すること。
-- =====================================================

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
