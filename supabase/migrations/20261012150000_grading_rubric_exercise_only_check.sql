-- A rubric on a non-exercise row would be graded as if it were an exercise. The app nulls
-- grading_rubric when the type leaves 'exercise', but that check lives in three write paths;
-- this CHECK is the one place a later path cannot skip.
ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_grading_rubric_exercise_only_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_grading_rubric_exercise_only_check
  CHECK (content_type = 'exercise' OR grading_rubric IS NULL);
