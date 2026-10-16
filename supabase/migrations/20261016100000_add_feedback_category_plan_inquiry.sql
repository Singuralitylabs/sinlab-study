-- =====================================================
-- feedbacks.category に plan_inquiry（プランの相談）を追加（#394）
-- =====================================================

ALTER TABLE public.feedbacks
  DROP CONSTRAINT IF EXISTS feedbacks_category_check;

ALTER TABLE public.feedbacks
  ADD CONSTRAINT feedbacks_category_check
  CHECK (category IN ('bug', 'improvement', 'question', 'other', 'plan_inquiry'));

COMMENT ON COLUMN public.feedbacks.category IS
  'bug / improvement / question / other / plan_inquiry';
