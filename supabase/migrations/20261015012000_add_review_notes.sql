-- review_notes stores learner memo / understood_at only (#309).
-- Items are derived from ai_reviews.review_json on each read; copying them here would drift.
-- UNIQUE uses COALESCE so one free memo (NULL requirement_key) per content is allowed.
-- RLS: owner-only CRUD via user_id = (select get_user_id()); staff cannot read notes.

CREATE TABLE IF NOT EXISTS public.review_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES public.learning_contents(id) ON DELETE CASCADE,
  -- NULL = free memo for the whole content (not tied to a requirement key)
  requirement_key TEXT NULL,
  memo TEXT NULL,
  understood_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT review_notes_memo_max_length CHECK (memo IS NULL OR char_length(memo) <= 500)
);

COMMENT ON TABLE public.review_notes IS
  '復習リストの本人メモと「理解した」チェック。復習項目の導出材料は持たない（ai_reviews から都度導出）';
COMMENT ON COLUMN public.review_notes.requirement_key IS
  '要件キー。NULL はコンテンツ単位の自由記述メモ（1 コンテンツ 1 行）';
COMMENT ON COLUMN public.review_notes.memo IS '一言メモ（最大 500 文字。超過はアプリが 400）';
COMMENT ON COLUMN public.review_notes.understood_at IS
  '「理解した」チェック時刻。克服済み判定には使わない（再提出で met になったときだけ克服）';

-- NULL requirement_key is one free memo per content (UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS review_notes_user_content_requirement_key_uidx
  ON public.review_notes (user_id, content_id, (COALESCE(requirement_key, '')));

CREATE INDEX IF NOT EXISTS review_notes_user_id_idx ON public.review_notes (user_id);
CREATE INDEX IF NOT EXISTS review_notes_content_id_idx ON public.review_notes (content_id);

CREATE TRIGGER update_review_notes_updated_at
  BEFORE UPDATE ON public.review_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.review_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own review notes" ON public.review_notes;
CREATE POLICY "Owners can view own review notes"
  ON public.review_notes FOR SELECT TO authenticated
  USING (user_id = (select get_user_id()));

DROP POLICY IF EXISTS "Owners can insert own review notes" ON public.review_notes;
CREATE POLICY "Owners can insert own review notes"
  ON public.review_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = (select get_user_id()));

DROP POLICY IF EXISTS "Owners can update own review notes" ON public.review_notes;
CREATE POLICY "Owners can update own review notes"
  ON public.review_notes FOR UPDATE TO authenticated
  USING (user_id = (select get_user_id()))
  WITH CHECK (user_id = (select get_user_id()));

DROP POLICY IF EXISTS "Owners can delete own review notes" ON public.review_notes;
CREATE POLICY "Owners can delete own review notes"
  ON public.review_notes FOR DELETE TO authenticated
  USING (user_id = (select get_user_id()));
