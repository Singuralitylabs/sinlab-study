-- Issue #216 local verification harness (minimal schema)
-- Proves storage.objects SELECT truth table matches isContentVisible().
-- Not a migration; run against an ephemeral Postgres for agent verification.

BEGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- Stub auth.uid() via session GUC
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE TABLE public.users (
  id serial PRIMARY KEY,
  auth_id uuid UNIQUE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::text FROM users
  WHERE auth_id = auth.uid() AND is_deleted = false AND status <> 'rejected'
  LIMIT 1;
$$;

CREATE TABLE public.learning_themes (
  id serial PRIMARY KEY,
  is_published boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE public.learning_phases (
  id serial PRIMARY KEY,
  theme_id integer NOT NULL REFERENCES public.learning_themes(id),
  is_published boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE public.learning_weeks (
  id serial PRIMARY KEY,
  phase_id integer NOT NULL REFERENCES public.learning_phases(id),
  is_published boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE public.learning_contents (
  id serial PRIMARY KEY,
  week_id integer NOT NULL REFERENCES public.learning_weeks(id),
  pdf_url text,
  is_published boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  is_open_to_trial boolean NOT NULL DEFAULT false
);

-- learning_contents SELECT RLS (simplified trial/active; content row only — intentional for方針A)
ALTER TABLE public.learning_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_contents FORCE ROW LEVEL SECURITY;
CREATE POLICY "learning_contents select"
  ON public.learning_contents FOR SELECT TO public
  USING (
    (select public.get_user_role()) IN ('admin', 'maintainer')
    OR (
      is_published = true AND is_deleted = false
      AND (
        (SELECT status FROM public.users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1) = 'active'
        OR (
          (SELECT status FROM public.users WHERE auth_id = auth.uid() AND is_deleted = false LIMIT 1) = 'trial'
          AND is_open_to_trial = true
        )
      )
    )
  );

CREATE TABLE storage.objects (
  id serial PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects FORCE ROW LEVEL SECURITY;

-- Policy under test (#216)
CREATE POLICY "Slides are viewable via visible contents or by content managers"
  ON storage.objects FOR SELECT TO public
  USING (
    bucket_id = 'slides'
    AND (
      (select public.get_user_role()) IN ('admin', 'maintainer')
      OR EXISTS (
        SELECT 1
        FROM public.learning_contents lc
        INNER JOIN public.learning_weeks lw ON lw.id = lc.week_id
        INNER JOIN public.learning_phases lp ON lp.id = lw.phase_id
        INNER JOIN public.learning_themes lt ON lt.id = lp.theme_id
        WHERE lc.pdf_url = storage.objects.name
          AND lc.is_published = true
          AND lc.is_deleted = false
          AND lw.is_published = true
          AND lw.is_deleted = false
          AND lp.is_published = true
          AND lp.is_deleted = false
          AND lt.is_published = true
          AND lt.is_deleted = false
      )
    )
  );

-- Seed hierarchy + slides
INSERT INTO public.learning_themes (id, is_published, is_deleted) VALUES
  (1, true, false),   -- published theme
  (2, false, false);  -- unpublished theme
INSERT INTO public.learning_phases (id, theme_id, is_published, is_deleted) VALUES
  (1, 1, true, false),
  (2, 1, false, false), -- unpublished phase under published theme
  (3, 2, true, false);  -- published phase under unpublished theme
INSERT INTO public.learning_weeks (id, phase_id, is_published, is_deleted) VALUES
  (1, 1, true, false),   -- fully published path
  (2, 1, false, false),  -- unpublished week
  (3, 2, true, false),   -- week under unpublished phase
  (4, 3, true, false);   -- week under unpublished theme
INSERT INTO public.learning_contents (id, week_id, pdf_url, is_published, is_deleted, is_open_to_trial) VALUES
  (1, 1, 'course/ok.pdf', true, false, true),
  (2, 2, 'course/hidden-week.pdf', true, false, true),
  (3, 3, 'course/hidden-phase.pdf', true, false, true),
  (4, 4, 'course/hidden-theme.pdf', true, false, true),
  (5, 1, 'course/unpublished-content.pdf', false, false, true),
  (6, 1, 'course/trial-locked.pdf', true, false, false);

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('slides', 'course/ok.pdf'),
  ('slides', 'course/hidden-week.pdf'),
  ('slides', 'course/hidden-phase.pdf'),
  ('slides', 'course/hidden-theme.pdf'),
  ('slides', 'course/unpublished-content.pdf'),
  ('slides', 'course/trial-locked.pdf'),
  ('slides', 'course/orphan.pdf');

INSERT INTO public.users (auth_id, role, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'member', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'member', 'trial'),
  ('33333333-3333-3333-3333-333333333333', 'admin', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'maintainer', 'active');

-- Superuser bypasses RLS even with FORCE; evaluate as non-superuser role.
DO $$ BEGIN
  CREATE ROLE app_user NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public, storage, auth TO app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_user;
GRANT SELECT ON storage.objects TO app_user;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO app_user;
GRANT EXECUTE ON FUNCTION auth.uid() TO app_user;

CREATE TEMP TABLE expect_results (
  actor text,
  object_name text,
  expect_visible boolean,
  actual_visible boolean
);
-- Allow app_user to write assertion rows while SELECT is evaluated under RLS.
GRANT ALL ON expect_results TO app_user;

CREATE OR REPLACE FUNCTION pg_temp.record_visibility(p_actor text, p_auth uuid, p_name text, p_expect boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  SELECT count(*) INTO v_count FROM storage.objects WHERE name = p_name;
  INSERT INTO expect_results VALUES (p_actor, p_name, p_expect, v_count > 0);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.record_visibility(text, uuid, text, boolean) TO app_user;

SET ROLE app_user;

-- member (active): only fully published hierarchy
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/ok.pdf', true);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/hidden-week.pdf', false);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/hidden-phase.pdf', false);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/hidden-theme.pdf', false);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/unpublished-content.pdf', false);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/trial-locked.pdf', true);
SELECT pg_temp.record_visibility('member', '11111111-1111-1111-1111-111111111111', 'course/orphan.pdf', false);

-- trial: same hierarchy rules + is_open_to_trial via learning_contents RLS
SELECT pg_temp.record_visibility('trial', '22222222-2222-2222-2222-222222222222', 'course/ok.pdf', true);
SELECT pg_temp.record_visibility('trial', '22222222-2222-2222-2222-222222222222', 'course/hidden-week.pdf', false);
SELECT pg_temp.record_visibility('trial', '22222222-2222-2222-2222-222222222222', 'course/hidden-phase.pdf', false);
SELECT pg_temp.record_visibility('trial', '22222222-2222-2222-2222-222222222222', 'course/hidden-theme.pdf', false);
SELECT pg_temp.record_visibility('trial', '22222222-2222-2222-2222-222222222222', 'course/trial-locked.pdf', false);

-- admin / maintainer: unconditional for slides bucket
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/ok.pdf', true);
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/hidden-week.pdf', true);
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/hidden-phase.pdf', true);
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/hidden-theme.pdf', true);
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/unpublished-content.pdf', true);
SELECT pg_temp.record_visibility('admin', '33333333-3333-3333-3333-333333333333', 'course/orphan.pdf', true);

SELECT pg_temp.record_visibility('maintainer', '44444444-4444-4444-4444-444444444444', 'course/hidden-week.pdf', true);
SELECT pg_temp.record_visibility('maintainer', '44444444-4444-4444-4444-444444444444', 'course/unpublished-content.pdf', true);

RESET ROLE;

-- Report
SELECT actor, object_name, expect_visible, actual_visible,
  CASE WHEN expect_visible = actual_visible THEN 'PASS' ELSE 'FAIL' END AS result
FROM expect_results
ORDER BY actor, object_name;

DO $$
DECLARE
  fail_count integer;
BEGIN
  SELECT count(*) INTO fail_count FROM expect_results WHERE expect_visible IS DISTINCT FROM actual_visible;
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'Issue #216 verification failed: % assertion(s)', fail_count;
  END IF;
  RAISE NOTICE 'Issue #216 verification PASSED: all assertions matched';
END $$;

-- EXPLAIN for InitPlan shape (member path on published slide)
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SET LOCAL ROLE app_user;
EXPLAIN (FORMAT TEXT)
SELECT 1 FROM storage.objects WHERE name = 'course/ok.pdf';
RESET ROLE;

ROLLBACK;
