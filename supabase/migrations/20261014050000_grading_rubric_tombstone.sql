-- 採点基準を削除・再設定しても「版 + 要件キー」を振り直さないための墓石（#344）。
--
-- これまで基準を消す（全行削除 / 演習以外へ種別変更）と grading_rubric は NULL になり、次の
-- 設定が v1・r1 から始まっていた。削除前の「v1 / r1」と再設定後の「v1 / r1」が別の要件を指すため、
-- 版 + キーで採点結果を集計・比較する機能（修了判定 #332）を入れる前に潰す。
--
-- 墓石 = requirements が空の grading_rubric。version は消す前の版 + 1、max_key_number は
-- 発行済みキー番号の最大値を引き継ぐ。墓石は「基準なし」として扱う（アプリは AI の参考採点に
-- 切り替える）。NULL は「一度も設定されたことがない」だけを表す。

-- 1) 形式 CHECK: requirements は配列であればよい（空 = 墓石）。
ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_grading_rubric_check;
ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_grading_rubric_check CHECK (
    grading_rubric IS NULL
    OR coalesce(
      -- A missing key makes the terms below NULL, and a CHECK treats NULL as passing, so the
      -- whole expression is coalesced to false.
      jsonb_typeof(grading_rubric) = 'object'
      AND jsonb_typeof(grading_rubric -> 'version') = 'number'
      AND (grading_rubric ->> 'version') ~ '^[1-9][0-9]*$'
      AND jsonb_typeof(grading_rubric -> 'requirements') = 'array',
      false
    )
  );

-- 2) 演習のみ CHECK: 演習以外の行には墓石（空の requirements）だけ置ける。
ALTER TABLE public.learning_contents
  DROP CONSTRAINT IF EXISTS learning_contents_grading_rubric_exercise_only_check;
ALTER TABLE public.learning_contents
  ADD CONSTRAINT learning_contents_grading_rubric_exercise_only_check CHECK (
    content_type = 'exercise'
    OR grading_rubric IS NULL
    OR coalesce(jsonb_array_length(grading_rubric -> 'requirements') = 0, false)
  );

-- 3) 基準を NULL にする UPDATE を墓石へ置き換える。
-- 書き込み経路（管理 API の編集 / 一括の種別変更 / 今後の経路）のどれを通っても振り直しが
-- 起きないよう、DB 側で一本化する。アプリの編集経路は自前で墓石を組み立てて送るので、
-- そこでは何もしない（NEW が NULL でないため）。
CREATE OR REPLACE FUNCTION public.keep_grading_rubric_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_requirements jsonb := OLD.grading_rubric -> 'requirements';
  issued_max bigint := 0;
BEGIN
  IF OLD.grading_rubric IS NULL OR NEW.grading_rubric IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 発行済み番号の高水位: 保存済みの max_key_number と、残っている r{n} キーの最大値。
  IF jsonb_typeof(OLD.grading_rubric -> 'max_key_number') = 'number'
     AND (OLD.grading_rubric ->> 'max_key_number') ~ '^[0-9]{1,9}$' THEN
    issued_max := (OLD.grading_rubric ->> 'max_key_number')::bigint;
  END IF;
  SELECT greatest(
           issued_max,
           coalesce(max(substring(item ->> 'key' FROM '^r([0-9]{1,9})$')::bigint), 0)
         )
    INTO issued_max
    FROM jsonb_array_elements(old_requirements) AS item;

  NEW.grading_rubric := jsonb_build_object(
    'version',
    CASE
      WHEN jsonb_array_length(old_requirements) = 0 THEN (OLD.grading_rubric ->> 'version')::integer
      ELSE (OLD.grading_rubric ->> 'version')::integer + 1
    END,
    'max_key_number', issued_max,
    'requirements', '[]'::jsonb
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_grading_rubric_tombstone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS keep_grading_rubric_tombstone ON public.learning_contents;
CREATE TRIGGER keep_grading_rubric_tombstone
  BEFORE UPDATE OF grading_rubric ON public.learning_contents
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_grading_rubric_tombstone();

COMMENT ON COLUMN public.learning_contents.grading_rubric IS
  '演習の採点基準 {version, max_key_number, requirements:[{key,name,description}]}。requirements が空 = 墓石（削除済み。版とキー番号の履歴だけ残す。基準なしとして扱う）。NULL は一度も設定されていない。基準の無い間は AI が要件を推測する参考採点で、修了判定には使わない';
