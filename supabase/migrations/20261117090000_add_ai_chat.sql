-- =====================================================
-- シンラビに相談（AIチャット）段階1 (#569)
--
-- 会話の本文は保存しない。回数制限と費用の集計のため、1回の質問ごとに本文を含まない行だけを
-- ai_chat_usage に残す。上限値は ai_chat_settings（1行。管理者が変更）に持つ。受講生が
-- 「復習リストに残す」を押した質問と回答だけを ai_chat_saved_notes に保存する。
--
-- 回数の確認と枠の確保は claim_ai_chat() が1トランザクション（ユーザー単位の advisory lock）で
-- 行い、同時に送られても上限を超えない。failed と古い pending（関数が落ちた行）は数えない。
-- =====================================================

-- ---------- ai_chat_settings ----------

CREATE TABLE IF NOT EXISTS public.ai_chat_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  active_per_day INTEGER NOT NULL DEFAULT 20,
  trial_lifetime INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT ai_chat_settings_single_row CHECK (id = 1),
  -- Same ranges as AI_CHAT_LIMIT_BOUNDS (app/constants/ai-chat.ts).
  CONSTRAINT ai_chat_settings_active_per_day_range CHECK (active_per_day BETWEEN 1 AND 100),
  CONSTRAINT ai_chat_settings_trial_lifetime_range CHECK (trial_lifetime BETWEEN 1 AND 30)
);

COMMENT ON TABLE public.ai_chat_settings IS
  'シンラビに相談の回数の上限値（1行のみ）。読めない・範囲外のときはアプリの既定値（AI_CHAT_LIMITS）で動く';
COMMENT ON COLUMN public.ai_chat_settings.active_per_day IS
  '有料会員の1日（JST）の質問回数（全コンテンツ合計）';
COMMENT ON COLUMN public.ai_chat_settings.trial_lifetime IS 'お試しの通算の質問回数';

CREATE INDEX IF NOT EXISTS idx_ai_chat_settings_updated_by
  ON public.ai_chat_settings (updated_by);

INSERT INTO public.ai_chat_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_chat_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view ai chat settings" ON public.ai_chat_settings;
CREATE POLICY "Authenticated users can view ai chat settings"
  ON public.ai_chat_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update ai chat settings" ON public.ai_chat_settings;
CREATE POLICY "Admins can update ai chat settings"
  ON public.ai_chat_settings FOR UPDATE
  TO authenticated
  USING ((select get_user_role()) = 'admin')
  WITH CHECK ((select get_user_role()) = 'admin');

REVOKE INSERT, DELETE ON public.ai_chat_settings FROM authenticated;

-- ---------- ai_chat_usage ----------

CREATE TABLE IF NOT EXISTS public.ai_chat_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER REFERENCES public.learning_contents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  counts_toward_limit BOOLEAN NOT NULL DEFAULT true,
  model_used TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  thoughts_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_chat_usage IS
  'シンラビに相談の利用記録（1行 = 質問1回）。質問・回答の本文は持たない';
COMMENT ON COLUMN public.ai_chat_usage.status IS
  'pending: 確保済み / completed: 回答済み / failed: Gemini の失敗（回数に数えない）';
COMMENT ON COLUMN public.ai_chat_usage.counts_toward_limit IS
  'false の行は回数の上限の集計に数えない（管理者のリセット用。行は残す）';

CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_user_created
  ON public.ai_chat_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_content_id
  ON public.ai_chat_usage (content_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_created_at
  ON public.ai_chat_usage (created_at);

CREATE TRIGGER update_ai_chat_usage_updated_at
  BEFORE UPDATE ON public.ai_chat_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ai_chat_usage ENABLE ROW LEVEL SECURITY;

-- Own rows for the remaining-count display; admin reads all for cost totals. Writes go through
-- claim_ai_chat() and the API's service_role only.
DROP POLICY IF EXISTS "Users can view own ai chat usage, admins can view all"
  ON public.ai_chat_usage;
CREATE POLICY "Users can view own ai chat usage, admins can view all"
  ON public.ai_chat_usage FOR SELECT
  TO authenticated
  USING (
    user_id = (select get_user_id())
    OR (select get_user_role()) = 'admin'
  );

REVOKE INSERT, UPDATE, DELETE ON public.ai_chat_usage FROM authenticated;

-- ---------- ai_chat_saved_notes ----------

CREATE TABLE IF NOT EXISTS public.ai_chat_saved_notes (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES public.learning_contents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same caps as AI_CHAT_MESSAGE_MAX_LENGTH / AI_CHAT_ANSWER_MAX_LENGTH.
  CONSTRAINT ai_chat_saved_notes_question_length
    CHECK (char_length(question) BETWEEN 1 AND 500),
  CONSTRAINT ai_chat_saved_notes_answer_length
    CHECK (char_length(answer) BETWEEN 1 AND 2000)
);

COMMENT ON TABLE public.ai_chat_saved_notes IS
  '受講生が「復習リストに残す」で保存したシンラビの回答と、その直前の質問';

CREATE INDEX IF NOT EXISTS idx_ai_chat_saved_notes_user_created
  ON public.ai_chat_saved_notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chat_saved_notes_content_id
  ON public.ai_chat_saved_notes (content_id);

ALTER TABLE public.ai_chat_saved_notes ENABLE ROW LEVEL SECURITY;

-- Owner only, staff included (a learner's own study record, like review_notes).
DROP POLICY IF EXISTS "Owners can view own ai chat saved notes" ON public.ai_chat_saved_notes;
CREATE POLICY "Owners can view own ai chat saved notes"
  ON public.ai_chat_saved_notes FOR SELECT
  TO authenticated
  USING (user_id = (select get_user_id()));

-- The EXISTS goes through learning_contents' own SELECT RLS, so a trial user cannot save on a
-- content outside the trial set even by calling PostgREST directly.
DROP POLICY IF EXISTS "Owners can insert own ai chat saved notes" ON public.ai_chat_saved_notes;
CREATE POLICY "Owners can insert own ai chat saved notes"
  ON public.ai_chat_saved_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select get_user_id())
    AND EXISTS (SELECT 1 FROM public.learning_contents lc WHERE lc.id = content_id)
  );

DROP POLICY IF EXISTS "Owners can delete own ai chat saved notes" ON public.ai_chat_saved_notes;
CREATE POLICY "Owners can delete own ai chat saved notes"
  ON public.ai_chat_saved_notes FOR DELETE
  TO authenticated
  USING (user_id = (select get_user_id()));

REVOKE UPDATE ON public.ai_chat_saved_notes FROM authenticated;

-- ---------- claim_ai_chat() ----------

-- Checks the count and takes one question's slot in one transaction. Returns
-- {outcome: 'claimed', usage_id, remaining} or {outcome: 'limited', reason, remaining: 0}.
-- Active: rows created since p_day_start (JST midnight). Trial: every row, ever.
CREATE OR REPLACE FUNCTION public.claim_ai_chat(
  p_user_id INTEGER,
  p_content_id INTEGER,
  p_user_status TEXT,
  p_stale_before TIMESTAMPTZ,
  p_day_start TIMESTAMPTZ,
  p_active_per_day INTEGER,
  p_trial_lifetime INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_used INTEGER;
  v_limit INTEGER;
  v_usage_id BIGINT;
BEGIN
  IF p_user_status IS NULL OR p_user_status NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'claim_ai_chat: unsupported user status %', p_user_status;
  END IF;
  IF p_user_id IS NULL OR p_content_id IS NULL OR p_stale_before IS NULL
    OR p_day_start IS NULL OR p_active_per_day IS NULL OR p_trial_lifetime IS NULL THEN
    RAISE EXCEPTION 'claim_ai_chat: arguments must not be NULL';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_ai_chat'), p_user_id);

  SELECT count(*)
  INTO v_used
  FROM public.ai_chat_usage u
  WHERE u.user_id = p_user_id
    AND u.status <> 'failed'
    AND u.counts_toward_limit
    AND NOT (u.status = 'pending' AND u.created_at < p_stale_before)
    AND (p_user_status = 'trial' OR u.created_at >= p_day_start);

  IF p_user_status = 'trial' THEN
    v_limit := p_trial_lifetime;
  ELSE
    v_limit := p_active_per_day;
  END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'outcome', 'limited',
      'reason', CASE WHEN p_user_status = 'trial' THEN 'trial_lifetime' ELSE 'user_daily' END,
      'remaining', 0
    );
  END IF;

  INSERT INTO public.ai_chat_usage (user_id, content_id, status)
  VALUES (p_user_id, p_content_id, 'pending')
  RETURNING id INTO v_usage_id;

  RETURN jsonb_build_object(
    'outcome', 'claimed',
    'usage_id', v_usage_id,
    'remaining', greatest(0, v_limit - v_used - 1)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_ai_chat(
  INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_chat(
  INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER
) TO service_role;
