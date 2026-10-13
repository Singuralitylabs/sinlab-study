-- =====================================================
-- AIレビューの回数上限の判定と枠の確保を1つのトランザクションにする (#343)
--
-- これまでは回数を通常の SELECT で数えてから ai_reviews 行を確保していた（check-then-act）ため、
-- 別々の提出を同時に送ると全リクエストが同じ件数を読み、上限を超えて通っていた。
-- claim_ai_review() はユーザー単位の advisory lock の中で「数える → 上限内なら行を確保」を行う。
-- 判定の意味は app/lib/ai-review-limits.ts の evaluateReviewRequest() と同じ
-- （failed と、AI_REVIEW_STALE_AFTER_MS を過ぎた pending / processing は数えない）。
-- 上限値・境界時刻はアプリ側の定数（AI_REVIEW_LIMITS / JST 当日の開始）を引数で受け取る。
-- 実行は service_role のみ。
-- =====================================================

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
  IF p_user_status NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'claim_ai_review: unsupported user status %', p_user_status;
  END IF;

  -- Serializes every claim of one user, so concurrent submissions cannot read the same counts.
  PERFORM pg_advisory_xact_lock(hashtext('claim_ai_review'), p_user_id);

  -- The user's own reviews for this content; failed and dead in-flight rows do not count.
  SELECT
    count(*),
    count(*) FILTER (WHERE r.created_at >= p_day_start)
  INTO v_content_count, v_content_today
  FROM public.ai_reviews r
  JOIN public.submissions s ON s.id = r.submission_id
  WHERE s.user_id = p_user_id
    AND s.content_id = p_content_id
    AND r.status <> 'failed'
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
      AND (r.status = 'completed' OR r.created_at > p_stale_before)
      AND r.created_at >= p_day_start;

    v_remaining := greatest(
      0,
      least(p_active_per_content_per_day - v_content_today, p_active_per_day - v_today_total)
    );

    -- Before the daily limits: a reviewed submission cannot be retried tomorrow either.
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

  -- Same claim as the former claimPendingAIReview(): a fresh row, else reuse of a failed / dead one.
  INSERT INTO public.ai_reviews (submission_id, status, created_at, score_kind)
  VALUES (p_submission_id, 'pending', now(), 'incomplete')
  ON CONFLICT (submission_id) DO NOTHING
  RETURNING id INTO v_review_id;

  IF v_review_id IS NULL THEN
    -- created_at is reset so a reused failed row does not keep its original day. The token
    -- columns are left alone: they keep the tokens already billed.
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
