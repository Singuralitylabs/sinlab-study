-- =====================================================
-- user_progress.ever_completed (#289)
--
-- 完了解除は is_completed を false、completed_at を NULL に戻す（機能設計書）。
-- その件数で first_content_completed を判定すると、解除して再完了するたびに
-- 初回イベントが再送される。ever_completed は一度 true にしたら戻さない。
-- SELECT は本人の全行で、コンテンツの公開状態では隠れない。
-- 現在完了している行だけ埋め戻す。解除済みで completed_at も消えている行は
-- 過去の完了が残っていないので埋められない。
-- =====================================================

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS ever_completed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_progress.ever_completed IS
  '一度でも完了したら true のまま。完了解除で is_completed / completed_at が戻っても first_content_completed を再送しない';

UPDATE public.user_progress
SET ever_completed = true
WHERE ever_completed = false
  AND (is_completed IS TRUE OR completed_at IS NOT NULL);

CREATE OR REPLACE FUNCTION public.keep_user_progress_ever_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A client that sends ever_completed=false on uncomplete must not wipe the first completion.
  IF TG_OP = 'UPDATE' AND OLD.ever_completed THEN
    NEW.ever_completed := true;
  ELSIF NEW.is_completed IS TRUE THEN
    NEW.ever_completed := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_user_progress_ever_completed ON public.user_progress;
CREATE TRIGGER keep_user_progress_ever_completed
  BEFORE INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_user_progress_ever_completed();

REVOKE ALL ON FUNCTION public.keep_user_progress_ever_completed() FROM PUBLIC, anon;
