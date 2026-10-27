-- Asserts table privileges that supabase/migrations/ produce. Expected values mirror
-- docs/database.md 6 (table privileges). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- anon has no privilege on any public table or sequence. The privilege checks sit in CASE because
-- the planner may evaluate them before the relkind filter, and they error on other relkinds.
select is(
  (
    select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and case when c.relkind in ('r', 'p', 'v', 'm', 'f') then
        has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
      else false end
  ),
  '{}'::text[],
  'anon has no table privilege in public'
);

select is(
  (
    select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') else false end
  ),
  '{}'::text[],
  'anon has no sequence privilege in public'
);

-- RLS does not apply to TRUNCATE, and the app never truncates, references or adds triggers.
select is(
  (
    select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and case when c.relkind in ('r', 'p') then
        has_table_privilege('authenticated', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
      else false end
  ),
  '{}'::text[],
  'authenticated has no TRUNCATE / REFERENCES / TRIGGER in public'
);

-- Tables used only through service_role (no RLS policy).
select is(
  has_table_privilege(r.role_name, s.table_name, p.privilege),
  r.expected,
  format('%s: %s %s = %s', s.table_name, r.role_name, p.privilege, r.expected)
)
from (
  values
    ('public.email_logs'),
    ('public.cron_locks'),
    ('public.stripe_events'),
    ('public.push_subscriptions'),
    ('public.push_logs'),
    ('public.feedbacks'),
    ('public.email_test_sends'),
    ('public.ai_review_limit_resets')
) as s(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
cross join (values ('authenticated', false), ('service_role', true)) as r(role_name, expected);

-- A sample of what the app does as authenticated (RLS then narrows the rows).
select is(
  has_table_privilege('authenticated', t.table_name, t.privilege),
  true,
  format('%s: authenticated %s = true', t.table_name, t.privilege)
)
from (
  values
    ('public.users', 'SELECT'),
    ('public.users', 'INSERT'),
    ('public.users', 'UPDATE'),
    ('public.submissions', 'INSERT'),
    ('public.user_progress', 'INSERT'),
    ('public.user_progress', 'UPDATE'),
    ('public.ai_reviews', 'SELECT'),
    ('public.announcement_reads', 'INSERT')
) as t(table_name, privilege);

select is(
  has_column_privilege('authenticated', 'public.learning_contents', 'title', 'SELECT'),
  true,
  'learning_contents.title: authenticated keeps column SELECT'
);

-- New tables created by postgres (as migrations do) get no anon or TRUNCATE grant.
create table public.__privileges_probe (id integer generated always as identity primary key);
select is(
  has_table_privilege('anon', 'public.__privileges_probe', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  false,
  'new table: anon has no privilege'
);
select is(
  has_table_privilege('authenticated', 'public.__privileges_probe', 'TRUNCATE, REFERENCES, TRIGGER'),
  false,
  'new table: authenticated has no TRUNCATE / REFERENCES / TRIGGER'
);
select is(
  has_table_privilege('authenticated', 'public.__privileges_probe', 'SELECT'),
  true,
  'new table: authenticated keeps the default SELECT'
);

select is(
  (
    select p.proconfig
    from pg_proc p
    where p.oid = 'public.update_updated_at_column()'::regprocedure
  ),
  array['search_path=public'],
  'update_updated_at_column(): search_path is fixed'
);

select * from finish();
rollback;
