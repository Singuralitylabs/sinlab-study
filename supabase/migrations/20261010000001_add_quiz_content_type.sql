-- =====================================================
-- クイズ用コンテンツ種別 'quiz' の追加 (#306)
--
-- 1 コンテンツ = 1 クイズ課題（設問 1〜3 個）。設問の形式は
-- single（単一選択）/ multiple（複数選択）/ text（入力式）。
--
-- 設問は learning_contents の JSONB 1 列ではなく quiz_questions テーブルに持つ。
-- learning_contents は受講者が SELECT できる（RLS）ため、列に正解を入れると
-- REST から回答前に正解が読めてしまう。quiz_questions は admin / maintainer 以外に
-- SELECT ポリシーを与えず、受講者は次の 2 つの SECURITY DEFINER 関数だけを通す。
--   - get_quiz_questions(content_id)     出題用の列（正解・模範解答・解説を含まない）
--   - grade_quiz_answers(content_id, answers)
--                                        全設問に回答したときだけ、正誤・正解・解説を返す
-- どちらも quiz_content_visible_to_caller() で、learning_contents の SELECT RLS と
-- isContentVisible()（learning-server.ts）を合わせた条件（4 階層の公開・未削除 +
-- active / お試しは is_open_to_trial）を自前で確認する（SECURITY DEFINER は RLS を通らないため）。
-- admin / maintainer は未公開プレビュー（仕様 2.12）のためロールで許可する。
--
-- text 形式は自動採点しない（is_correct は NULL）。回答後に模範解答と解説を表示する。
--
-- 管理画面からの保存は service_role（admin-server.ts）で replace_quiz_questions() を呼び、
-- 削除と挿入を 1 トランザクションで行う（途中失敗で設問が欠けた状態を残さない）。
-- =====================================================

-- ---------- content_type に 'quiz' を追加 ----------
-- 初版（create_tables）の列 CHECK は自動命名で learning_contents_content_type_check。
ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_content_type_check;

ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_content_type_check
  CHECK (content_type IN ('video', 'text', 'exercise', 'slide', 'quiz'));

-- ---------- quiz_questions ----------
-- 正解の添字が choices の範囲内で重複しないこと。CHECK にサブクエリは書けないため関数にする。
CREATE OR REPLACE FUNCTION public.quiz_correct_choices_valid(p_choices TEXT[], p_correct INTEGER[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(p_correct) x WHERE x IS NULL OR x < 0 OR x >= cardinality(p_choices)
  )
  AND cardinality(p_correct) = (SELECT count(DISTINCT x) FROM unnest(p_correct) x);
$$;

REVOKE ALL ON FUNCTION public.quiz_correct_choices_valid(TEXT[], INTEGER[]) FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id SERIAL PRIMARY KEY,
  content_id INTEGER NOT NULL REFERENCES public.learning_contents(id) ON DELETE CASCADE,
  -- 1〜3。UNIQUE (content_id, display_order) と合わせて 1 コンテンツ 3 問までを保証する
  -- （QUIZ_MAX_QUESTIONS。採点 API も 3 問までしか受け付けない）。
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 3),
  question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('single', 'multiple', 'text')),
  question TEXT NOT NULL CHECK (btrim(question) <> ''),
  choices TEXT[] NOT NULL DEFAULT '{}',
  -- 0 始まりの choices の添字
  correct_choices INTEGER[] NOT NULL DEFAULT '{}',
  model_answer TEXT,
  explanation TEXT,
  hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, display_order),
  -- 形式ごとの整合性。アプリ側（QuizQuestionSchema）でも同じ条件を検証する。
  CONSTRAINT quiz_questions_shape_check CHECK (
    CASE question_type
      WHEN 'text' THEN
        cardinality(choices) = 0
        AND cardinality(correct_choices) = 0
        AND model_answer IS NOT NULL AND btrim(model_answer) <> ''
      WHEN 'single' THEN
        cardinality(choices) BETWEEN 2 AND 6
        AND cardinality(correct_choices) = 1
      ELSE
        cardinality(choices) BETWEEN 2 AND 6
        AND cardinality(correct_choices) BETWEEN 1 AND cardinality(choices)
    END
  ),
  CONSTRAINT quiz_questions_correct_choices_check CHECK (
    quiz_correct_choices_valid(choices, correct_choices)
  )
);

COMMENT ON TABLE public.quiz_questions IS
  'クイズ（content_type=quiz）の設問。正解を含むため受講者には SELECT させず、get_quiz_questions / grade_quiz_answers 経由でのみ渡す';
COMMENT ON COLUMN public.quiz_questions.correct_choices IS
  '正解の選択肢（choices の 0 始まりの添字）。text 形式は空';
COMMENT ON COLUMN public.quiz_questions.model_answer IS
  'text 形式の模範解答（回答後に表示）。選択式では未使用';

CREATE INDEX IF NOT EXISTS idx_quiz_questions_content_id
  ON public.quiz_questions (content_id, display_order);

DROP TRIGGER IF EXISTS update_quiz_questions_updated_at ON public.quiz_questions;
CREATE TRIGGER update_quiz_questions_updated_at
  BEFORE UPDATE ON public.quiz_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- 受講者（member / お試し）向けのポリシーは作らない（正解を REST で読ませない）。
DROP POLICY IF EXISTS "Quiz questions are managed by content managers" ON public.quiz_questions;
CREATE POLICY "Quiz questions are managed by content managers"
  ON public.quiz_questions FOR ALL TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'))
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

-- ---------- 可視性判定（内部用） ----------
CREATE OR REPLACE FUNCTION public.quiz_content_visible_to_caller(p_content_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learning_contents lc
    INNER JOIN learning_weeks lw ON lw.id = lc.week_id
    INNER JOIN learning_phases lp ON lp.id = lw.phase_id
    INNER JOIN learning_themes lt ON lt.id = lp.theme_id
    WHERE lc.id = p_content_id
      AND lc.content_type = 'quiz'
      AND lc.is_deleted = false
      AND (
        get_user_role() IN ('admin', 'maintainer')
        OR (
          lc.is_published = true
          AND lw.is_published = true AND lw.is_deleted = false
          AND lp.is_published = true AND lp.is_deleted = false
          AND lt.is_published = true AND lt.is_deleted = false
          AND CASE get_user_status()
            WHEN 'active' THEN true
            WHEN 'trial' THEN lc.is_open_to_trial
            ELSE false
          END
        )
      )
  );
$$;

-- 直接呼ばせない（下の 2 関数は所有者権限で実行されるため呼べる）。
REVOKE ALL ON FUNCTION public.quiz_content_visible_to_caller(INTEGER)
  FROM PUBLIC, anon, authenticated;

-- ---------- 出題 ----------
CREATE OR REPLACE FUNCTION public.get_quiz_questions(p_content_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  display_order INTEGER,
  question_type TEXT,
  question TEXT,
  choices TEXT[],
  hint TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT quiz_content_visible_to_caller(p_content_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT q.id, q.display_order, q.question_type::text, q.question, q.choices, q.hint
    FROM quiz_questions q
    WHERE q.content_id = p_content_id
    ORDER BY q.display_order, q.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(INTEGER) TO authenticated, service_role;

-- ---------- 採点 ----------
-- p_answers: [{"question_id": 1, "choices": [0, 2]}, {"question_id": 2, "text": "..."}]
-- 1 問でも未回答（選択式で選択なし・入力式で空文字）か、同じ question_id が重複していれば
-- 何も返さない。これは「回答を送る前に正解を見せない」ための形式上の条件で、ダミーの回答を
-- 送れば正解・解説は得られる（回答内容は保存しないため、それ以上は守らない）。
-- 選択肢の重複・範囲外の添字は不正解として扱う。
CREATE OR REPLACE FUNCTION public.grade_quiz_answers(p_content_id INTEGER, p_answers JSONB)
RETURNS TABLE (
  question_id INTEGER,
  question_type TEXT,
  is_correct BOOLEAN,
  correct_choices INTEGER[],
  model_answer TEXT,
  explanation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT quiz_content_visible_to_caller(p_content_id) THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RETURN;
  END IF;

  -- Without this, the per-question lookup below would pick one of the duplicates arbitrarily.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) a
    WHERE jsonb_typeof(a) = 'object'
    GROUP BY a ->> 'question_id'
    HAVING count(*) > 1
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM quiz_questions q
    WHERE q.content_id = p_content_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_answers) a
        WHERE jsonb_typeof(a) = 'object'
          AND a ->> 'question_id' = q.id::text
          AND CASE
            WHEN q.question_type = 'text' THEN
              jsonb_typeof(a -> 'text') = 'string' AND btrim(a ->> 'text') <> ''
            ELSE
              jsonb_typeof(a -> 'choices') = 'array' AND jsonb_array_length(a -> 'choices') > 0
          END
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      q.id,
      q.question_type::text,
      CASE
        WHEN q.question_type = 'text' THEN NULL
        ELSE (
          SELECT COALESCE(
            array_agg(DISTINCT c.value ORDER BY c.value) = (
              SELECT array_agg(DISTINCT x::numeric ORDER BY x::numeric)
              FROM unnest(q.correct_choices) x
            )
            AND count(*) = count(DISTINCT c.value),
            false
          )
          FROM (
            SELECT CASE WHEN jsonb_typeof(e) = 'number' THEN (e #>> '{}')::numeric END AS value
            FROM jsonb_array_elements(
              (
                SELECT a -> 'choices'
                FROM jsonb_array_elements(p_answers) a
                WHERE jsonb_typeof(a) = 'object' AND a ->> 'question_id' = q.id::text
                LIMIT 1
              )
            ) e
          ) c
        )
      END,
      q.correct_choices,
      q.model_answer,
      q.explanation
    FROM quiz_questions q
    WHERE q.content_id = p_content_id
    ORDER BY q.display_order, q.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grade_quiz_answers(INTEGER, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_quiz_answers(INTEGER, JSONB) TO authenticated, service_role;

-- ---------- 管理画面からの一括置換 ----------
-- p_questions: [{"question_type": "single", "question": "...", "choices": ["a","b"],
--               "correct_choices": [0], "model_answer": null, "explanation": "...", "hint": null}]
-- 並び順は配列の順。service_role 専用（admin-server.ts が権限確認後に呼ぶ）。
-- 同じ位置（display_order）の行は UPDATE して id を保つ（回答中の受講者の question_id を
-- 無効にしないため）。増えた分は INSERT、減った分は DELETE。
CREATE OR REPLACE FUNCTION public.replace_quiz_questions(p_content_id INTEGER, p_questions JSONB)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_questions must be a JSON array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM quiz_questions
  WHERE content_id = p_content_id AND display_order > jsonb_array_length(p_questions);

  INSERT INTO quiz_questions (
    content_id, display_order, question_type, question, choices, correct_choices,
    model_answer, explanation, hint
  )
  SELECT
    p_content_id,
    t.ord::integer,
    t.q ->> 'question_type',
    t.q ->> 'question',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(t.q -> 'choices')), '{}'),
    COALESCE(
      ARRAY(SELECT (jsonb_array_elements_text(t.q -> 'correct_choices'))::integer),
      '{}'
    ),
    t.q ->> 'model_answer',
    t.q ->> 'explanation',
    t.q ->> 'hint'
  FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS t(q, ord)
  ON CONFLICT (content_id, display_order) DO UPDATE SET
    question_type = EXCLUDED.question_type,
    question = EXCLUDED.question,
    choices = EXCLUDED.choices,
    correct_choices = EXCLUDED.correct_choices,
    model_answer = EXCLUDED.model_answer,
    explanation = EXCLUDED.explanation,
    hint = EXCLUDED.hint;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_quiz_questions(INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_quiz_questions(INTEGER, JSONB) TO service_role;
