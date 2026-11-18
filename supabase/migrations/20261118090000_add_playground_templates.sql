-- =====================================================
-- 「コードを試す」のひな形 playground_templates を追加 (#580)
--
-- 講座の外で自由にコードを書いて実行するページ（/playground）に、運営が用意した
-- コードを短いリンク（/playground/t/<slug>）で配るためのひな形。体験会でスライドに
-- QR コードを載せて配る想定。利用者のコード（下書き）は DB に保存しない
-- （ブラウザの localStorage にだけ保存する）。
--
-- 列:
--   slug   … リンク用の推測しにくいランダム文字列（[a-z0-9] 10文字、アプリが発行）
--   kind   … 実行の種類（web / python / sql）。ブラウザ内で実行できるものだけ
--   files  … [{ filename, language, content }] の配列（code_files と同じ形）。
--             上限（ファイル数・大きさ）はアプリの定数 app/constants/playground.ts と揃える
--
-- RLS:
--   SELECT は「公開中かつ利用者のステータスが active / trial」、または admin / maintainer
--   （管理画面とリンクの事前確認）。INSERT / UPDATE / DELETE は admin / maintainer。
--   ポリシーは (select get_user_xxx()) で包み、同一操作は OR で1本にまとめる。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.playground_templates (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]{10}$'),
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND char_length(title) <= 100),
  kind TEXT NOT NULL CHECK (kind IN ('web', 'python', 'sql')),
  files JSONB NOT NULL
    CHECK (
      jsonb_typeof(files) = 'array'
      AND jsonb_array_length(files) BETWEEN 1 AND 10
      -- 合計 200,000 文字（全角は1文字3バイト）に JSON の記号分の余裕を足した上限
      AND octet_length(files::text) <= 700000
    ),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.playground_templates IS
  '「コードを試す」で短いリンクから開くひな形。運営が作成し、公開中のものだけ受講者が開ける';
COMMENT ON COLUMN public.playground_templates.slug IS 'リンク用のランダム文字列（/playground/t/<slug>）';
COMMENT ON COLUMN public.playground_templates.kind IS '実行の種類（web / python / sql）';
COMMENT ON COLUMN public.playground_templates.files IS
  '[{ filename, language, content }]。language は拡張子からアプリが決める';

CREATE TRIGGER update_playground_templates_updated_at
  BEFORE UPDATE ON public.playground_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.playground_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published playground templates or managers can view"
  ON public.playground_templates;
CREATE POLICY "Published playground templates or managers can view"
  ON public.playground_templates FOR SELECT TO authenticated
  USING (
    (is_published = true AND (select get_user_status()) IN ('active', 'trial'))
    OR (select get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can insert playground templates" ON public.playground_templates;
CREATE POLICY "Content managers can insert playground templates"
  ON public.playground_templates FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Content managers can update playground templates" ON public.playground_templates;
CREATE POLICY "Content managers can update playground templates"
  ON public.playground_templates FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'))
  WITH CHECK ((select get_user_role()) IN ('admin', 'maintainer'));

DROP POLICY IF EXISTS "Content managers can delete playground templates" ON public.playground_templates;
CREATE POLICY "Content managers can delete playground templates"
  ON public.playground_templates FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('admin', 'maintainer'));
