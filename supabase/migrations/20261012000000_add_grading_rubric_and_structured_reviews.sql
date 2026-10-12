-- =====================================================
-- AIレビューの構造化採点と採点基準 (#305)
--
-- learning_contents.grading_rubric: 演習ごとの採点基準（要件の一覧）。
--   { "version": 1, "requirements": [{ "key": "r1", "name": "...", "description": "..." }] }
--   NULL は「基準未設定」で、AI が要件を推測する参考採点（score_kind = 'estimated'）になり、
--   修了判定には使わない。version は内容が変わった保存のたびにアプリ側で +1 する。
--   演習（content_type = 'exercise'）のみ設定する運用はアプリ側で担保する。
--
-- ai_reviews:
--   review_json     構造化結果（要件ごとの判定・コード品質・改善提案・アドバイス）
--   score_kind      rubric = 採点基準に基づく採点 / estimated = 基準未設定の参考採点 /
--                   none = URL 提出で採点対象外 / legacy = 本マイグレーション以前の自由文レビュー
--   rubric_version  rubric のとき採点に使った基準のバージョン
--   passed          rubric のときの合否（コードで計算。それ以外は NULL）
--   thoughts_tokens usageMetadata.thoughtsTokenCount（思考トークン。既存行は NULL のまま）。
--                   completion_tokens（回答本文のみ）の意味は変えない
--   既存行は score_kind = 'legacy' のまま残し、再採点しない。
--
-- RLS は変更なし（既存ポリシーの範囲で新しい列が読める）。
-- =====================================================

ALTER TABLE public.learning_contents
  ADD COLUMN IF NOT EXISTS grading_rubric JSONB;

ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_grading_rubric_check;
ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_grading_rubric_check CHECK (
    grading_rubric IS NULL
    OR (
      jsonb_typeof(grading_rubric) = 'object'
      AND jsonb_typeof(grading_rubric -> 'version') = 'number'
      AND (grading_rubric ->> 'version') ~ '^[1-9][0-9]*$'
      AND jsonb_typeof(grading_rubric -> 'requirements') = 'array'
      AND jsonb_array_length(grading_rubric -> 'requirements') >= 1
    )
  );

COMMENT ON COLUMN public.learning_contents.grading_rubric IS
  '演習の採点基準 {version, requirements:[{key,name,description}]}。NULL は未設定（AI が要件を推測する参考採点で、修了判定には使わない）';

ALTER TABLE public.ai_reviews
  ADD COLUMN IF NOT EXISTS review_json JSONB,
  ADD COLUMN IF NOT EXISTS score_kind TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS rubric_version INTEGER,
  ADD COLUMN IF NOT EXISTS passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS thoughts_tokens INTEGER;

ALTER TABLE public.ai_reviews
  DROP CONSTRAINT IF EXISTS ai_reviews_score_kind_check;
ALTER TABLE public.ai_reviews
  ADD CONSTRAINT ai_reviews_score_kind_check
  CHECK (score_kind IN ('rubric', 'estimated', 'none', 'legacy'));

COMMENT ON COLUMN public.ai_reviews.review_json IS
  '構造化レビュー {requirements:[{key,name,status,comment}], code_quality:{level,comment}, suggestions, advice}。legacy は NULL';
COMMENT ON COLUMN public.ai_reviews.score_kind IS
  'rubric=採点基準に基づく採点 / estimated=基準未設定の参考採点 / none=URL提出で採点対象外 / legacy=構造化採点以前の自由文レビュー';
COMMENT ON COLUMN public.ai_reviews.rubric_version IS 'score_kind=rubric のとき採点に使った grading_rubric.version';
COMMENT ON COLUMN public.ai_reviews.passed IS 'score_kind=rubric のときの合否（コードで計算）。それ以外・合格点が無効の間は NULL';
COMMENT ON COLUMN public.ai_reviews.thoughts_tokens IS
  'Gemini の思考トークン数（thoughtsTokenCount。再生成時は合算）。過去分は NULL。completion_tokens は回答本文のみ';
