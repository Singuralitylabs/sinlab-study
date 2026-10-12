-- grading_rubric is the hidden marking guide (the editor labels it 非公開). RLS lets a learner
-- read every column of a published row, so a browser select=grading_rubric returned the criteria.
-- service_role keeps the column: the AI review route and the manage UI read it with the admin client.
REVOKE SELECT (grading_rubric) ON TABLE public.learning_contents FROM PUBLIC, anon, authenticated;
