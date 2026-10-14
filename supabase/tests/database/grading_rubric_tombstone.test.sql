-- Deleting a grading rubric must leave a tombstone (empty requirements, version + 1, key
-- high-water mark kept), never NULL, so a rubric set later cannot restart at v1 / r1 (#344).
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into public.learning_themes (id, name) values (9001, 'tombstone theme');
insert into public.learning_phases (id, theme_id, name) values (9001, 9001, 'tombstone phase');
insert into public.learning_weeks (id, phase_id, name) values (9001, 9001, 'tombstone week');
insert into public.learning_contents (id, week_id, title, content_type, grading_rubric)
values (
  9001, 9001, 'tombstone exercise', 'exercise',
  '{"version": 2, "max_key_number": 5, "requirements": [{"key": "r1", "name": "A", "description": ""}, {"key": "r7", "name": "B", "description": ""}]}'
);

-- NULL becomes a tombstone: version + 1, the higher of max_key_number and the keys still present.
update public.learning_contents set grading_rubric = null where id = 9001;
select is(
  (select grading_rubric from public.learning_contents where id = 9001),
  '{"version": 3, "max_key_number": 7, "requirements": []}'::jsonb,
  'clearing a rubric stores a tombstone with the next version and the key high-water mark'
);

-- Clearing again keeps the tombstone as it is.
update public.learning_contents set grading_rubric = null where id = 9001;
select is(
  (select grading_rubric from public.learning_contents where id = 9001),
  '{"version": 3, "max_key_number": 7, "requirements": []}'::jsonb,
  'clearing a tombstone leaves it unchanged'
);

-- A row that never had a rubric stays NULL.
insert into public.learning_contents (id, week_id, title, content_type)
values (9002, 9001, 'never had a rubric', 'exercise');
update public.learning_contents set grading_rubric = null where id = 9002;
select is(
  (select grading_rubric from public.learning_contents where id = 9002),
  null::jsonb,
  'a row without a rubric stays NULL'
);

-- Bulk type change (SET content_type, grading_rubric = NULL) passes the exercise-only CHECK.
update public.learning_contents set grading_rubric = '{"version": 1, "requirements": [{"key": "r3", "name": "A", "description": ""}]}' where id = 9002;
update public.learning_contents set content_type = 'video', grading_rubric = null where id = 9002;
select is(
  (select grading_rubric from public.learning_contents where id = 9002),
  '{"version": 2, "max_key_number": 3, "requirements": []}'::jsonb,
  'leaving exercise stores a tombstone'
);

-- CHECK boundaries.
select throws_ok(
  $$update public.learning_contents set grading_rubric = '{"version": 1, "requirements": [{"key": "r1", "name": "A", "description": ""}]}' where id = 9002$$,
  '23514',
  null,
  'a live rubric cannot sit on a non-exercise row'
);
select throws_ok(
  $$update public.learning_contents set grading_rubric = '{"version": 1}' where id = 9001$$,
  '23514',
  null,
  'requirements is required'
);
select throws_ok(
  $$update public.learning_contents set grading_rubric = '{"version": 1, "requirements": "x"}' where id = 9001$$,
  '23514',
  null,
  'requirements must be an array'
);

select * from finish();
rollback;
