-- =====================================================
-- record_content_view RPC (#501)
--
-- POST /api/progress/view used five serial Supabase round-trips
-- (visibility SELECT, last_viewed_at SELECT, newer-view count, upsert,
-- plus getServerAuth's users SELECT). Fold visibility + debounce +
-- last_viewed_at upsert into one SECURITY INVOKER transaction.
-- API keeps requireLearnerApi() → this RPC (two round-trips total).
--
-- Visibility matches isContentVisible(): published hierarchy filters
-- plus INVOKER RLS (trial is_open_to_trial, etc.). Admin / maintainer
-- RLS bypass is closed by the explicit is_published filters.
-- Only last_viewed_at is written; completion / retry columns untouched.
-- enforce_user_progress_review_pass() ignores non-completion writes.
-- =====================================================

CREATE OR REPLACE FUNCTION public.record_content_view(
  p_content_id INTEGER,
  p_debounce_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id INTEGER;
  v_existing TIMESTAMPTZ;
  v_has_newer BOOLEAN;
BEGIN
  IF p_content_id IS NULL OR p_content_id < 1 THEN
    RAISE EXCEPTION 'invalid content id' USING ERRCODE = '22023';
  END IF;

  IF p_debounce_ms IS NULL OR p_debounce_ms < 0 THEN
    RAISE EXCEPTION 'invalid debounce' USING ERRCODE = '22023';
  END IF;

  v_user_id := public.get_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Same published hierarchy as learning-server isContentVisible(); RLS still applies.
  IF NOT EXISTS (
    SELECT 1
    FROM public.learning_contents AS lc
    INNER JOIN public.learning_phases AS lp ON lp.id = lc.phase_id
    INNER JOIN public.learning_themes AS lt ON lt.id = lp.theme_id
    WHERE lc.id = p_content_id
      AND lc.is_published = true
      AND lc.is_deleted = false
      AND lp.is_published = true
      AND lp.is_deleted = false
      AND lt.is_published = true
      AND lt.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'content not visible' USING ERRCODE = '42501';
  END IF;

  SELECT up.last_viewed_at
  INTO v_existing
  FROM public.user_progress AS up
  WHERE up.user_id = v_user_id
    AND up.content_id = p_content_id;

  -- Skip only continuous reloads of the content that is already the learner's latest view.
  -- After visiting another content, reopen must rewrite so continue-learning tracks it (#396).
  IF v_existing IS NOT NULL
    AND (clock_timestamp() - v_existing)
      < (p_debounce_ms::double precision * INTERVAL '1 millisecond')
  THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_progress AS up
      WHERE up.user_id = v_user_id
        AND up.last_viewed_at > v_existing
    )
    INTO v_has_newer;

    IF NOT v_has_newer THEN
      RETURN jsonb_build_object('success', true, 'skipped', true);
    END IF;
  END IF;

  INSERT INTO public.user_progress (user_id, content_id, last_viewed_at)
  VALUES (v_user_id, p_content_id, clock_timestamp())
  ON CONFLICT (user_id, content_id)
  DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at;

  RETURN jsonb_build_object('success', true, 'skipped', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_content_view(INTEGER, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_content_view(INTEGER, INTEGER)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_content_view(INTEGER, INTEGER) IS
  'Record last_viewed_at for continue-learning (#501). Visibility + debounce + upsert in one INVOKER transaction. Returns {success, skipped}.';
