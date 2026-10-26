-- Asserts EXECUTE privileges of public functions against the real ACLs that
-- supabase/migrations/ produce. Expected values mirror docs/database.md
-- (3.7, 3.8, 3.18, 5.2, 6.2, 6.15, 6.17, 6.18). Run with `supabase test db`.
--
-- service_role is asserted only where the docs name it. Functions documented as
-- "internal" keep Supabase's default grant to service_role, which is not part of the contract.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select is(
  has_function_privilege(t.role_name, t.signature, 'execute'),
  t.expected,
  format('%s: %s EXECUTE = %s', t.signature, t.role_name, t.expected)
)
from (
  values
    -- Service-role-only functions
    ('public.get_weekly_funnel(integer)', 'anon', false),
    ('public.get_weekly_funnel(integer)', 'authenticated', false),
    ('public.get_weekly_funnel(integer)', 'service_role', true),
    ('public.claim_email_test_send(integer, timestamp with time zone, integer)', 'anon', false),
    ('public.claim_email_test_send(integer, timestamp with time zone, integer)', 'authenticated', false),
    ('public.claim_email_test_send(integer, timestamp with time zone, integer)', 'service_role', true),
    ('public.claim_notification_email_confirm(integer, text, timestamp with time zone, integer)', 'anon', false),
    ('public.claim_notification_email_confirm(integer, text, timestamp with time zone, integer)', 'authenticated', false),
    ('public.claim_notification_email_confirm(integer, text, timestamp with time zone, integer)', 'service_role', true),
    ('public.claim_ai_review(integer, integer, integer, text, timestamp with time zone, timestamp with time zone, integer, integer, integer)', 'anon', false),
    ('public.claim_ai_review(integer, integer, integer, text, timestamp with time zone, timestamp with time zone, integer, integer, integer)', 'authenticated', false),
    ('public.claim_ai_review(integer, integer, integer, text, timestamp with time zone, timestamp with time zone, integer, integer, integer)', 'service_role', true),
    ('public.admin_reset_ai_review_limits(integer, integer, integer)', 'anon', false),
    ('public.admin_reset_ai_review_limits(integer, integer, integer)', 'authenticated', false),
    ('public.admin_reset_ai_review_limits(integer, integer, integer)', 'service_role', true),
    ('public.admin_reopen_ai_review(integer, integer)', 'anon', false),
    ('public.admin_reopen_ai_review(integer, integer)', 'authenticated', false),
    ('public.admin_reopen_ai_review(integer, integer)', 'service_role', true),
    ('public.replace_quiz_questions(integer, jsonb)', 'anon', false),
    ('public.replace_quiz_questions(integer, jsonb)', 'authenticated', false),
    ('public.replace_quiz_questions(integer, jsonb)', 'service_role', true),
    -- Trigger function: never callable through REST
    ('public.stamp_stripe_subscription_funnel_times()', 'anon', false),
    ('public.stamp_stripe_subscription_funnel_times()', 'authenticated', false),
    ('public.keep_grading_rubric_tombstone()', 'anon', false),
    ('public.keep_grading_rubric_tombstone()', 'authenticated', false),
    -- Internal helpers behind the quiz and model-answer RPCs
    ('public.content_requires_review_pass(integer)', 'anon', false),
    ('public.content_requires_review_pass(integer)', 'authenticated', true),
    ('public.content_requires_review_pass(integer)', 'service_role', true),
    ('public.content_review_pass_unachievable(integer)', 'anon', false),
    ('public.content_review_pass_unachievable(integer)', 'authenticated', true),
    ('public.content_review_pass_unachievable(integer)', 'service_role', true),
    ('public.content_visible_to_caller(integer, text)', 'anon', false),
    ('public.content_visible_to_caller(integer, text)', 'authenticated', false),
    ('public.content_visible_to_caller(integer, text)', 'service_role', false),
    ('public.learning_content_requires_review_pass(integer)', 'anon', false),
    ('public.learning_content_requires_review_pass(integer)', 'authenticated', false),
    ('public.learning_content_requires_review_pass(integer)', 'service_role', false),
    ('public.learning_content_review_pass_unachievable(integer)', 'anon', false),
    ('public.learning_content_review_pass_unachievable(integer)', 'authenticated', false),
    ('public.learning_content_review_pass_unachievable(integer)', 'service_role', false),
    ('public.quiz_content_visible_to_caller(integer)', 'anon', false),
    ('public.quiz_content_visible_to_caller(integer)', 'authenticated', false),
    ('public.quiz_question_revision(text, text, text[])', 'anon', false),
    ('public.quiz_question_revision(text, text, text[])', 'authenticated', false),
    -- Callable by signed-in users, never by anon
    ('public.get_students_progress_summary()', 'anon', false),
    ('public.get_students_progress_summary()', 'authenticated', true),
    ('public.get_students_progress_summary()', 'service_role', true),
    ('public.get_exercise_review_pass_state(integer)', 'anon', false),
    ('public.get_exercise_review_pass_state(integer)', 'authenticated', true),
    ('public.get_exercise_review_pass_state(integer)', 'service_role', true),
    ('public.record_content_view(integer, integer)', 'anon', false),
    ('public.record_content_view(integer, integer)', 'authenticated', true),
    ('public.record_content_view(integer, integer)', 'service_role', true),
    ('public.bulk_update_sibling_display_order(text, jsonb)', 'anon', false),
    ('public.bulk_update_sibling_display_order(text, jsonb)', 'authenticated', true),
    ('public.bulk_update_sibling_display_order(text, jsonb)', 'service_role', true),
    ('public.get_quiz_questions(integer)', 'anon', false),
    ('public.get_quiz_questions(integer)', 'authenticated', true),
    ('public.get_quiz_questions(integer)', 'service_role', true),
    ('public.get_exercise_reference_answer(integer)', 'anon', false),
    ('public.get_exercise_reference_answer(integer)', 'authenticated', true),
    ('public.get_exercise_reference_answer(integer)', 'service_role', true),
    ('public.grade_quiz_answers(integer, jsonb)', 'anon', false),
    ('public.grade_quiz_answers(integer, jsonb)', 'authenticated', true),
    ('public.grade_quiz_answers(integer, jsonb)', 'service_role', true),
    ('public.quiz_correct_choices_valid(text[], integer[])', 'anon', false),
    ('public.quiz_correct_choices_valid(text[], integer[])', 'authenticated', true),
    ('public.quiz_correct_choices_valid(text[], integer[])', 'service_role', true),
    -- Trigger function: REVOKE ALL FROM PUBLIC, anon (authenticated is not documented)
    ('public.keep_user_progress_ever_completed()', 'anon', false),
    ('public.enforce_user_progress_review_pass()', 'anon', false),
    -- RLS helpers
    ('public.get_user_role()', 'anon', false),
    ('public.get_user_role()', 'authenticated', true),
    ('public.get_user_role()', 'service_role', true),
    ('public.get_user_id()', 'anon', false),
    ('public.get_user_id()', 'authenticated', true),
    ('public.get_user_id()', 'service_role', true),
    ('public.get_user_status()', 'anon', false),
    ('public.get_user_status()', 'authenticated', true),
    ('public.get_user_status()', 'service_role', true),
    ('public.get_user_membership_type()', 'anon', false),
    ('public.get_user_membership_type()', 'authenticated', true),
    ('public.get_user_membership_type()', 'service_role', true)
) as t(signature, role_name, expected);

-- update_updated_at_column() is a trigger function whose EXECUTE roles docs/database.md does not
-- name, so it is only inventoried. keep_user_progress_ever_completed() is asserted for anon above.
--
-- Catches a new public function that this file does not cover, so its ACL gets a human look.
select is(
  (
    select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  ),
  array[
    'admin_reopen_ai_review(integer,integer)',
    'admin_reset_ai_review_limits(integer,integer,integer)',
    'bulk_update_sibling_display_order(text,jsonb)',
    'claim_ai_review(integer,integer,integer,text,timestamp with time zone,timestamp with time zone,integer,integer,integer)',
    'claim_email_test_send(integer,timestamp with time zone,integer)',
    'claim_notification_email_confirm(integer,text,timestamp with time zone,integer)',
    'content_requires_review_pass(integer)',
    'content_review_pass_unachievable(integer)',
    'content_visible_to_caller(integer,text)',
    'enforce_user_progress_review_pass()',
    'get_exercise_reference_answer(integer)',
    'get_exercise_review_pass_state(integer)',
    'get_quiz_questions(integer)',
    'get_students_progress_summary()',
    'get_user_id()',
    'get_user_membership_type()',
    'get_user_role()',
    'get_user_status()',
    'get_weekly_funnel(integer)',
    'grade_quiz_answers(integer,jsonb)',
    'keep_grading_rubric_tombstone()',
    'keep_user_progress_ever_completed()',
    'learning_content_requires_review_pass(integer)',
    'learning_content_review_pass_unachievable(integer)',
    'quiz_content_visible_to_caller(integer)',
    'quiz_correct_choices_valid(text[],integer[])',
    'quiz_question_revision(text,text,text[])',
    'record_content_view(integer,integer)',
    'replace_quiz_questions(integer,jsonb)',
    'stamp_stripe_subscription_funnel_times()',
    'update_updated_at_column()'
  ]::text[],
  'every public function is covered by this file or listed here on purpose'
);

-- Learners must not read the model answer or rubric columns directly (RPC only).
select is(
  has_column_privilege(t.role_name, 'public.learning_contents', t.column_name, 'select'),
  t.expected,
  format('learning_contents.%s: %s SELECT = %s', t.column_name, t.role_name, t.expected)
)
from (
  values
    ('anon', 'reference_answer', false),
    ('authenticated', 'reference_answer', false),
    ('anon', 'grading_rubric', false),
    ('authenticated', 'grading_rubric', false),
    ('anon', 'has_grading_requirements', true),
    ('authenticated', 'has_grading_requirements', true),
    ('anon', 'preview_base_html', true),
    ('authenticated', 'preview_base_html', true),
    ('authenticated', 'exercise_instructions', true)
) as t(role_name, column_name, expected);

select * from finish();
rollback;
