-- =====================================================
-- 管理者による AI レビュー回数のリセットと再レビューの許可 (#482)
--
-- 回数はカウンターではなく ai_reviews の行数から導く。履歴・合格判定・トークン記録を残すため、
-- 行は消さずに counts_toward_limit = false にして「回数に数えない」扱いにする。
-- 再レビューの許可は、完了済みの行を failed に戻す（claim_ai_review() が再利用できる状態にする）。
-- どちらも claim_ai_review() と同じユーザー単位の advisory lock の中で行い、並行する申請と競合しない。
-- 実行は service_role のみ。操作履歴は ai_review_limit_resets に残す。
-- =====================================================

ALTER TABLE public.ai_reviews
  ADD COLUMN IF NOT EXISTS counts_toward_limit BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_reviews.counts_toward_limit IS
  '管理者のリセットで false になった行は、回数の上限の集計に数えない（行・履歴は残す）';

CREATE TABLE IF NOT EXISTS public.ai_review_limit_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES public.learning_contents(id) ON DELETE SET NULL,
  submission_id INTEGER REFERENCES public.submissions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('reset', 'reopen')),
  affected_count INTEGER NOT NULL,
  performed_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_review_limit_resets_user_created
  ON public.ai_review_limit_resets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_review_limit_resets_content_id
  ON public.ai_review_limit_resets (content_id);
CREATE INDEX IF NOT EXISTS idx_ai_review_limit_resets_submission_id
  ON public.ai_review_limit_resets (submission_id);
CREATE INDEX IF NOT EXISTS idx_ai_review_limit_resets_performed_by
  ON public.ai_review_limit_resets (performed_by);

-- Policy-less on purpose: service_role only.
ALTER TABLE public.ai_review_limit_resets ENABLE ROW LEVEL SECURITY;

-- claim_ai_review(): same signature, but counts skip rows an admin reset.
CREATE OR REPLACE FUNCTION public.claim_ai_review(
  p_user_id INTEGER,
  p_submission_id INTEGER,
  p_content_id INTEGER,
  p_user_status TEXT,
  p_stale_before TIMESTAMPTZ,
  p_day_start TIMESTAMPTZ,
  p_active_per_content_per_day INTEGER,
  p_active_per_day INTEGER,
  p_trial_per_content_lifetime INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_same_id INTEGER;
  v_same_status TEXT;
  v_content_count INTEGER;
  v_content_today INTEGER;
  v_today_total INTEGER := 0;
  v_remaining INTEGER;
  v_review_id INTEGER;
BEGIN
  IF p_user_status IS NULL OR p_user_status NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'claim_ai_review: unsupported user status %', p_user_status;
  END IF;
  IF p_user_id IS NULL OR p_submission_id IS NULL OR p_content_id IS NULL
    OR p_stale_before IS NULL OR p_day_start IS NULL
    OR p_active_per_content_per_day IS NULL OR p_active_per_day IS NULL
    OR p_trial_per_content_lifetime IS NULL THEN
    RAISE EXCEPTION 'claim_ai_review: arguments must not be NULL';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_ai_review'), p_user_id);

  -- counts_toward_limit = false (admin reset) rows are skipped here, but not in the same-submission
  -- lookup below: a reset frees the allowance, not a submission that already has its review.
  SELECT
    count(*),
    count(*) FILTER (WHERE r.created_at >= p_day_start)
  INTO v_content_count, v_content_today
  FROM public.ai_reviews r
  JOIN public.submissions s ON s.id = r.submission_id
  WHERE s.user_id = p_user_id
    AND s.content_id = p_content_id
    AND r.status <> 'failed'
    AND r.counts_toward_limit
    AND NOT (r.status IN ('pending', 'processing') AND r.created_at < p_stale_before);

  SELECT r.id, r.status
  INTO v_same_id, v_same_status
  FROM public.ai_reviews r
  WHERE r.submission_id = p_submission_id
    AND r.status <> 'failed'
    AND NOT (r.status IN ('pending', 'processing') AND r.created_at < p_stale_before);

  IF v_same_status IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('outcome', 'processing', 'review_id', v_same_id);
  END IF;

  IF p_user_status = 'trial' THEN
    v_remaining := greatest(0, p_trial_per_content_lifetime - v_content_count);
    IF v_content_count >= p_trial_per_content_lifetime THEN
      RETURN jsonb_build_object('outcome', 'limited', 'reason', 'trial_lifetime', 'remaining', 0);
    END IF;
  ELSE
    SELECT count(*)
    INTO v_today_total
    FROM public.ai_reviews r
    JOIN public.submissions s ON s.id = r.submission_id
    WHERE s.user_id = p_user_id
      AND r.status <> 'failed'
      AND r.counts_toward_limit
      AND (r.status = 'completed' OR r.created_at > p_stale_before)
      AND r.created_at >= p_day_start;

    v_remaining := greatest(
      0,
      least(p_active_per_content_per_day - v_content_today, p_active_per_day - v_today_total)
    );

    IF v_same_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'outcome', 'limited', 'reason', 'submission_reviewed', 'remaining', v_remaining
      );
    END IF;
    IF v_content_today >= p_active_per_content_per_day THEN
      RETURN jsonb_build_object('outcome', 'limited', 'reason', 'content_daily', 'remaining', 0);
    END IF;
    IF v_today_total >= p_active_per_day THEN
      RETURN jsonb_build_object('outcome', 'limited', 'reason', 'user_daily', 'remaining', 0);
    END IF;
  END IF;

  INSERT INTO public.ai_reviews (submission_id, status, created_at, score_kind)
  VALUES (p_submission_id, 'pending', now(), 'incomplete')
  ON CONFLICT (submission_id) DO NOTHING
  RETURNING id INTO v_review_id;

  IF v_review_id IS NULL THEN
    -- counts_toward_limit is left alone: a review an admin reopened stays free of the allowance.
    UPDATE public.ai_reviews
    SET status = 'pending',
        review_content = NULL,
        overall_score = NULL,
        error_message = NULL,
        reviewed_at = NULL,
        review_json = NULL,
        rubric_version = NULL,
        passed = NULL,
        score_kind = 'incomplete',
        created_at = now()
    WHERE submission_id = p_submission_id
      AND (
        status = 'failed'
        OR (status IN ('pending', 'processing') AND created_at < p_stale_before)
      )
    RETURNING id INTO v_review_id;
  END IF;

  IF v_review_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'claimed',
    'review_id', v_review_id,
    'remaining', greatest(0, v_remaining - 1)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_ai_review(
  INTEGER, INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_review(
  INTEGER, INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER
) TO service_role;

-- Excludes the user's reviews from the counts. p_content_id NULL = every content of the user.
-- In-flight (pending / processing) rows are left alone so a running review is not double-claimed.
CREATE OR REPLACE FUNCTION public.admin_reset_ai_review_limits(
  p_user_id INTEGER,
  p_content_id INTEGER,
  p_performed_by INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_performed_by IS NULL THEN
    RAISE EXCEPTION 'admin_reset_ai_review_limits: arguments must not be NULL';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_ai_review'), p_user_id);

  UPDATE public.ai_reviews r
  SET counts_toward_limit = false
  FROM public.submissions s
  WHERE s.id = r.submission_id
    AND s.user_id = p_user_id
    AND (p_content_id IS NULL OR s.content_id = p_content_id)
    AND r.counts_toward_limit
    AND r.status = 'completed';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.ai_review_limit_resets (user_id, content_id, action, affected_count, performed_by)
  VALUES (p_user_id, p_content_id, 'reset', v_count, p_performed_by);

  RETURN v_count;
END;
$$;

-- Returns a completed review to `failed` so the learner can run it again (claim_ai_review() reuses
-- failed rows). The re-run does not use up the allowance. Returns false when the submission has no
-- completed review, or when that review passed: certificates count a passing completed review, so
-- reopening it would silently take the certificate basis away.
CREATE OR REPLACE FUNCTION public.admin_reopen_ai_review(
  p_submission_id INTEGER,
  p_performed_by INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id INTEGER;
  v_content_id INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_submission_id IS NULL OR p_performed_by IS NULL THEN
    RAISE EXCEPTION 'admin_reopen_ai_review: arguments must not be NULL';
  END IF;

  SELECT s.user_id, s.content_id INTO v_user_id, v_content_id
  FROM public.submissions s
  WHERE s.id = p_submission_id;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_ai_review'), v_user_id);

  UPDATE public.ai_reviews
  SET status = 'failed',
      error_message = '管理者が再レビューを許可しました',
      counts_toward_limit = false
  WHERE submission_id = p_submission_id
    AND status = 'completed'
    AND passed IS DISTINCT FROM true;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_review_limit_resets
    (user_id, content_id, submission_id, action, affected_count, performed_by)
  VALUES (v_user_id, v_content_id, p_submission_id, 'reopen', v_updated, p_performed_by);

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_ai_review_limits(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_ai_review_limits(INTEGER, INTEGER, INTEGER)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reopen_ai_review(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reopen_ai_review(INTEGER, INTEGER) TO service_role;
