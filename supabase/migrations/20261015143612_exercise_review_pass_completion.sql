-- 採点基準ありの演習は、合格レビューがあるときだけ完了にできる（#367）。
--
-- 対象は content_type = 'exercise' かつ grading_rubric IS NOT NULL かつ
-- allowed_submission_types <> 'url'（#367）。URL のみは passed が付かないので完了ボタンのまま。
-- both はコード提出で合格できるので対象のまま。
-- 空の requirements（墓石 #344）も NOT NULL なので合格必須。合否は isReviewPassed() だけが
-- 付け、空配列は点数が無く passed が付かない。合格が無いのでその演習は完了できない。
-- NULL（一度も基準が無い）と演習以外は従来どおり手動完了できる。
--
-- RLS は本人が is_completed を自由に立てられる。BEFORE INSERT/UPDATE で、true への遷移
-- （INSERT、またはまだ true でない行の UPDATE）に合格レビューを要求する。すでに true の行の
-- 他列更新は判定しない（導入前の手動完了を遡って取り消さない）。合格判定対象を未完了へ戻す
-- 更新は拒否する（REST で落とすと、合格なしでは戻せないため）。
--
-- grading_rubric は受講生の列権限に無いので、関数は SECURITY DEFINER・search_path 固定。
-- 見るのは真偽値だけ。既存の RLS ポリシーは変えない。

-- 内部用。API ロールには EXECUTE を渡さない（トリガーと下の RPC が所有者として呼ぶ）。
CREATE OR REPLACE FUNCTION public.learning_content_requires_review_pass(p_content_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learning_contents lc
    WHERE lc.id = p_content_id
      AND lc.content_type = 'exercise'
      AND lc.grading_rubric IS NOT NULL
      AND lc.allowed_submission_types <> 'url'
  );
$$;

REVOKE ALL ON FUNCTION public.learning_content_requires_review_pass(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

-- 画面と進捗 API が採点基準の中身を読まずに対象かどうかだけ知る。不可視は false（存在を漏らさない）。
CREATE OR REPLACE FUNCTION public.content_requires_review_pass(p_content_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT content_visible_to_caller(p_content_id, 'exercise')
    AND learning_content_requires_review_pass(p_content_id);
$$;

REVOKE ALL ON FUNCTION public.content_requires_review_pass(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_requires_review_pass(INTEGER)
  TO authenticated, service_role;

-- 墓石は合格必須のまま完了できない。画面が合格点の案内を出さないよう、空配列かどうかだけ返す。
CREATE OR REPLACE FUNCTION public.learning_content_review_pass_unachievable(p_content_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.learning_content_requires_review_pass(p_content_id)
    AND EXISTS (
      SELECT 1
      FROM learning_contents lc
      WHERE lc.id = p_content_id
        AND coalesce(jsonb_array_length(lc.grading_rubric -> 'requirements'), 0) = 0
    );
$$;

REVOKE ALL ON FUNCTION public.learning_content_review_pass_unachievable(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.content_review_pass_unachievable(p_content_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT content_visible_to_caller(p_content_id, 'exercise')
    AND learning_content_review_pass_unachievable(p_content_id);
$$;

REVOKE ALL ON FUNCTION public.content_review_pass_unachievable(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_review_pass_unachievable(INTEGER)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_user_progress_review_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clearing, or moving the row off, a pass-gated exercise. A direct write must not drop a
  -- completion that cannot be put back without a passing review.
  IF TG_OP = 'UPDATE' AND OLD.is_completed IS TRUE THEN
    IF (
      NEW.is_completed IS NOT TRUE
      OR OLD.content_id IS DISTINCT FROM NEW.content_id
    ) AND public.learning_content_requires_review_pass(OLD.content_id) THEN
      RAISE EXCEPTION 'pass-gated exercise completion cannot be cleared'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.content_id IS NOT DISTINCT FROM NEW.content_id AND NEW.is_completed IS TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.is_completed IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NOT public.learning_content_requires_review_pass(NEW.content_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM submissions s
    INNER JOIN ai_reviews r ON r.submission_id = s.id
    WHERE s.user_id = NEW.user_id
      AND s.content_id = NEW.content_id
      AND r.status = 'completed'
      AND r.passed IS TRUE
  ) THEN
    RAISE EXCEPTION 'pass-gated exercise requires a passing review'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- authenticated keeps EXECUTE so the learner's INSERT/UPDATE can fire the trigger
-- (same as keep_user_progress_ever_completed). anon cannot call it over REST.
REVOKE ALL ON FUNCTION public.enforce_user_progress_review_pass() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS enforce_user_progress_review_pass ON public.user_progress;
CREATE TRIGGER enforce_user_progress_review_pass
  BEFORE INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_progress_review_pass();

COMMENT ON FUNCTION public.learning_content_requires_review_pass(INTEGER) IS
  '演習かつ grading_rubric IS NOT NULL かつ URL のみでない。空配列の墓石も含む。内部用';
COMMENT ON FUNCTION public.content_requires_review_pass(INTEGER) IS
  '呼び出し元に見える演習だけ、合格で完了する対象かを返す。基準の中身は返さない';
COMMENT ON FUNCTION public.learning_content_review_pass_unachievable(INTEGER) IS
  '合格必須のうち、要件が空で合格にならない演習。内部用';
COMMENT ON FUNCTION public.content_review_pass_unachievable(INTEGER) IS
  '呼び出し元に見える演習だけ、合格必須だが合格にならないかを返す。基準の中身は返さない';
COMMENT ON FUNCTION public.enforce_user_progress_review_pass() IS
  '合格判定対象の演習は、合格レビューなしに完了へできない。既存の完了行は維持する';
