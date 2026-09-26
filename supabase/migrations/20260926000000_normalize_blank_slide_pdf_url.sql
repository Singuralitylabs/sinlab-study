-- =====================================================
-- learning_contents.pdf_url の空文字・空白のみを NULL に正規化 (#243)
--
-- アプリ側は空文字の pdf_url を `toSlideObjectKey()` で null（スライド無し）として
-- 無害に扱う一方、`20260917011152_validate_slide_pdf_url_object_keys.sql` の検証は
-- 空文字・空白のみを不正値として例外で中断する。規則が食い違っていたため、
--   1. 管理APIの `SlidePdfUrlSchema`（`app/services/api/schemas.ts`）で空文字・空白のみを
--      null に正規化し、以後アプリから空文字が保存されないようにした。
--   2. 本マイグレーションで既存の空文字・空白のみの行を NULL に更新する
--      （検証で中断させず、正規化で吸収する）。
-- 適用済みの `20260917011152` は書き換えない。
--
-- 条件の空白除去は `20260917011152` の正規化式と同じ `btrim(pdf_url, E' \t\r\n')`。
-- JS 側 `isBlankSlidePdfUrl()`（`app/lib/slide-object-key.ts`）と同じ規則であることを
-- `tests/lib/slide-object-key-sql-parity.test.ts` が担保する。
-- 冪等（2回目以降は該当行が無く何も更新しない）。
-- =====================================================

UPDATE public.learning_contents
SET pdf_url = NULL
WHERE pdf_url IS NOT NULL
  AND btrim(pdf_url, E' \t\r\n') = '';
