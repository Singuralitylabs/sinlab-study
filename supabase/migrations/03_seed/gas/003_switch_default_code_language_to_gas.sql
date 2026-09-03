-- =====================================================
-- 既存GAS課題（基礎編）の既定言語を javascript → gas に一括切り替え (#56)
--
-- 対象: テーマ「GAS学習」（基礎編）配下の exercise コンテンツ。
-- シード（gas/002_exercises.sql）では code_language を明示していないため
-- テーブルのデフォルト値 'javascript' のままだったが、中身は console.log や
-- SpreadsheetApp / GmailApp / CalendarApp などを使う純粋な GAS スクリプトであり、
-- #56 で追加した 'gas' を既定言語として設定するのが実態に合う。
--
-- 対象外: テーマ「GAS学習（応用編）」（gas-advanced）配下の演習は
-- code_language='html' を意図的に使用している（提出物の中身がHTML/CSSで、
-- GASコードは doGet() の補助スニペットに過ぎないため）。誤って対象に
-- 含めないよう、テーマ名を 'GAS学習' に完全一致させて絞り込む。
--
-- WHERE 句に code_language = 'javascript' を含めるため、既に手動で
-- 変更済みの行や再実行時は対象外となり冪等（0件更新でエラーにはならない）。
-- =====================================================

UPDATE learning_contents lc
SET code_language = 'gas'
FROM learning_weeks w
JOIN learning_phases p ON p.id = w.phase_id
JOIN learning_themes t ON t.id = p.theme_id
WHERE lc.week_id = w.id
  AND t.name = 'GAS学習'
  AND lc.content_type = 'exercise'
  AND lc.code_language = 'javascript'
  AND lc.is_deleted = false;
