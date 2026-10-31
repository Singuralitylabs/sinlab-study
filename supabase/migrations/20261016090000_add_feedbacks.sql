-- =====================================================
-- feedbacks（#392 段階1）
--
-- 受講生の不具合報告・改善要望・質問。DB を正とし、Slack 失敗でも声は残す。
-- RLS は有効化しポリシーは作らない。読み書きは getServerAuth() 済みの API から
-- service_role で user_id を固定する（push_subscriptions と同じ）。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('bug', 'improvement', 'question', 'other')),
  body TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feedbacks IS
  '受講生フィードバック。service_role 専用（RLS 有効・ポリシーなし）。user_id は認証済み API が固定する';
COMMENT ON COLUMN public.feedbacks.category IS
  'bug / improvement / question / other';
COMMENT ON COLUMN public.feedbacks.status IS
  'open / in_progress / done。管理画面から更新';
COMMENT ON COLUMN public.feedbacks.page_url IS
  '投稿時のページ URL（クライアントが自動付与）';
COMMENT ON COLUMN public.feedbacks.user_agent IS
  '投稿時の User-Agent（クライアントが自動付与）';

CREATE INDEX IF NOT EXISTS feedbacks_created_at_idx
  ON public.feedbacks (created_at DESC);

CREATE INDEX IF NOT EXISTS feedbacks_user_id_created_at_idx
  ON public.feedbacks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feedbacks_status_idx
  ON public.feedbacks (status);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
