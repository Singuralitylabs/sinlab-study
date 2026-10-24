-- =====================================================
-- AI レビュー回数の上限値を管理画面で変更できるようにする (#482)
--
-- ai_review_settings: id = 1 の1行のみ。初期値は app/constants/gemini.ts の AI_REVIEW_LIMITS と同じに
-- し、適用直後の挙動を変えない。行が読めない・範囲外のときは、アプリが AI_REVIEW_LIMITS に戻す。
-- 範囲は AI_REVIEW_LIMIT_BOUNDS と同じ（コスト急増を防ぐため上限も設ける）。
--
-- RLS: SELECT は認証済み全員（受講生の画面に上限を表示するため。機微な値ではない）、UPDATE は admin のみ。
-- INSERT / DELETE のポリシーは作らない。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ai_review_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  active_per_content_per_day INTEGER NOT NULL DEFAULT 2,
  active_per_day INTEGER NOT NULL DEFAULT 10,
  trial_per_content_lifetime INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT ai_review_settings_single_row CHECK (id = 1),
  CONSTRAINT ai_review_settings_active_per_content_per_day_range
    CHECK (active_per_content_per_day BETWEEN 1 AND 20),
  CONSTRAINT ai_review_settings_active_per_day_range CHECK (active_per_day BETWEEN 1 AND 100),
  CONSTRAINT ai_review_settings_trial_per_content_lifetime_range
    CHECK (trial_per_content_lifetime BETWEEN 1 AND 10),
  CONSTRAINT ai_review_settings_day_covers_content
    CHECK (active_per_day >= active_per_content_per_day)
);

COMMENT ON TABLE public.ai_review_settings IS
  'AI レビュー回数の上限値（1行のみ）。読めない・範囲外のときはアプリの既定値（AI_REVIEW_LIMITS）で動く';
COMMENT ON COLUMN public.ai_review_settings.active_per_content_per_day IS
  '有料会員の1課題あたり1日（JST）のレビュー回数';
COMMENT ON COLUMN public.ai_review_settings.active_per_day IS
  '有料会員の全課題合計の1日（JST）のレビュー回数';
COMMENT ON COLUMN public.ai_review_settings.trial_per_content_lifetime IS
  'お試しの1課題あたりの生涯レビュー回数';

CREATE INDEX IF NOT EXISTS idx_ai_review_settings_updated_by
  ON public.ai_review_settings (updated_by);

INSERT INTO public.ai_review_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_review_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view ai review settings"
  ON public.ai_review_settings;
CREATE POLICY "Authenticated users can view ai review settings"
  ON public.ai_review_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update ai review settings" ON public.ai_review_settings;
CREATE POLICY "Admins can update ai review settings"
  ON public.ai_review_settings FOR UPDATE
  USING ((select get_user_role()) = 'admin')
  WITH CHECK ((select get_user_role()) = 'admin');
