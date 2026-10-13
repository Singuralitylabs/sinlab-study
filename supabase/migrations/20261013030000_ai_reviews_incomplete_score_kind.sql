-- New claims used the column default 'legacy', so a failed review from this system was
-- indistinguishable from a pre-migration free-text review. 'incomplete' is the not-yet-graded
-- state (pending, processing, or failed). The default stays 'legacy' so existing rows are not
-- relabelled; the app sets 'incomplete' when it creates or reuses a row.
ALTER TABLE public.ai_reviews
  DROP CONSTRAINT IF EXISTS ai_reviews_score_kind_check;

ALTER TABLE public.ai_reviews
  ADD CONSTRAINT ai_reviews_score_kind_check
  CHECK (score_kind IN ('rubric', 'estimated', 'none', 'legacy', 'incomplete'));

COMMENT ON COLUMN public.ai_reviews.score_kind IS
  'rubric=採点基準に基づく採点 / estimated=基準未設定の参考採点 / none=URL提出で採点対象外 / legacy=構造化採点以前の自由文（既存行） / incomplete=このシステムが作成し、まだ採点が完了していない行';
