-- =====================================================
-- GAS学習（実践編）: 週「Geminiを使ったドキュメント自動要約」の所属フェーズ移動
--
-- 背景（#168）: 20260614080707_seed_gas_practical_course_structure.sql は、この週の
-- 所属フェーズを「その他GAS活用」として作成していたが、本番の実際の所属は
-- 「Googleドキュメント活用」（display_orderも1,2の次の6。3〜5は欠番）だった。
-- 同ファイルのVALUESは#168で修正済みだが、Supabase CLIはバージョン番号の
-- 存在有無のみで適用判定するため、`20260614080707` を旧内容（フェーズ誤り）で
-- 既に `db push` 済みの環境（version自体は記録済み）では、そのファイルの
-- 内容修正だけでは再実行されず、週は「その他GAS活用」配下に残ったままになる。
--
-- 本ファイルは新規バージョンとして独立させることで、旧内容が既に適用された
-- 環境にも通常の `db push` で届く。対象週が「その他GAS活用」配下に見つかった
-- 場合のみ「Googleドキュメント活用」へ移動する冪等なUPDATEのため、
-- 本番のように既に正しい配置になっている環境（対象行が無い）や、
-- #168修正後の内容で初めて `db push` した環境（最初から正しい配置で作成される）
-- では対象行が無く何も変更されない（無害な no-op）。
-- =====================================================

UPDATE learning_weeks lw
SET phase_id = lp_new.id,
    display_order = 6
FROM learning_phases lp_old
JOIN learning_themes lt ON lt.id = lp_old.theme_id
JOIN learning_phases lp_new
  ON lp_new.theme_id = lt.id AND lp_new.name = 'Googleドキュメント活用'
WHERE lw.phase_id = lp_old.id
  AND lt.name = 'GAS学習（実践編）'
  AND lp_old.name = 'その他GAS活用'
  AND lw.name = 'Geminiを使ったドキュメント自動要約';
