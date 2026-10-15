-- Pass-gated exercises cannot be completed without a passing review, including a direct
-- INSERT/UPDATE of the kind PostgREST upsert issues (#367). Already-completed rows can still
-- be updated. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into public.learning_themes (id, name) values (9101, 'pass gate theme');
insert into public.learning_phases (id, theme_id, name) values (9101, 9101, 'pass gate phase');
insert into public.learning_weeks (id, phase_id, name) values (9101, 9101, 'pass gate week');

insert into public.learning_contents (id, week_id, title, content_type, grading_rubric)
values (
  9101, 9101, 'rubric exercise', 'exercise',
  '{"version": 1, "requirements": [{"key": "r1", "name": "A", "description": ""}]}'
);
insert into public.learning_contents (id, week_id, title, content_type, grading_rubric)
values (
  9102, 9101, 'tombstone exercise', 'exercise',
  '{"version": 2, "max_key_number": 1, "requirements": []}'
);
insert into public.learning_contents (id, week_id, title, content_type)
values (9103, 9101, 'no rubric exercise', 'exercise');
insert into public.learning_contents (id, week_id, title, content_type)
values (9104, 9101, 'a video', 'video');

insert into public.users (id, auth_id, email, display_name, status)
values
  (9101, '00000000-0000-0000-0000-000000009101', 'pass-a@example.com', 'A', 'active'),
  (9102, '00000000-0000-0000-0000-000000009102', 'pass-b@example.com', 'B', 'active');

insert into public.submissions (id, user_id, content_id, submission_type, code_content)
values
  (9101, 9101, 9101, 'code', 'passed'),
  (9102, 9101, 9101, 'code', 'failed'),
  (9103, 9102, 9101, 'code', 'other user');

insert into public.ai_reviews (submission_id, status, score_kind, passed, review_content)
values
  (9101, 'completed', 'rubric', true, 'ok'),
  (9102, 'completed', 'rubric', false, 'retry'),
  (9103, 'completed', 'rubric', true, 'not this user');

select throws_ok(
  $$insert into public.user_progress (user_id, content_id, is_completed)
    values (9102, 9101, true)$$,
  '42501',
  null,
  'direct insert of a completed pass-gated row without that user''s pass is rejected'
);

select lives_ok(
  $$insert into public.user_progress (user_id, content_id, is_completed)
    values (9101, 9101, true)$$,
  'direct insert is allowed when that user has a passing review'
);
select is(
  (select ever_completed from public.user_progress where user_id = 9101 and content_id = 9101),
  true,
  'a passing completion still sets ever_completed'
);

select lives_ok(
  $$update public.user_progress set completed_at = now()
    where user_id = 9101 and content_id = 9101$$,
  'an already completed pass-gated row can be updated'
);

select throws_ok(
  $$update public.user_progress set is_completed = false
    where user_id = 9101 and content_id = 9101$$,
  '42501',
  null,
  'a pass-gated completion cannot be cleared'
);

select lives_ok(
  $$insert into public.user_progress (user_id, content_id, is_completed)
    values (9101, 9102, true)$$,
  'a tombstone rubric does not require a pass'
);
select lives_ok(
  $$insert into public.user_progress (user_id, content_id, is_completed)
    values (9101, 9103, true)$$,
  'an exercise without a rubric does not require a pass'
);
select lives_ok(
  $$insert into public.user_progress (user_id, content_id, is_completed)
    values (9101, 9104, true)$$,
  'a non-exercise does not require a pass'
);
select lives_ok(
  $$update public.user_progress set is_completed = false
    where user_id = 9101 and content_id = 9104$$,
  'a non-exercise can still be marked incomplete'
);

-- Pre-feature completions have no passing review. The migration must not revoke them, and a
-- later update that keeps is_completed true must still succeed.
alter table public.user_progress disable trigger enforce_user_progress_review_pass;
insert into public.user_progress (user_id, content_id, is_completed)
values (9102, 9101, true);
alter table public.user_progress enable trigger enforce_user_progress_review_pass;

select lives_ok(
  $$update public.user_progress set completed_at = now()
    where user_id = 9102 and content_id = 9101$$,
  'an existing completion without a pass can still be updated'
);
select is(
  (select is_completed from public.user_progress where user_id = 9102 and content_id = 9101),
  true,
  'an existing completion stays completed'
);

select * from finish();
rollback;
