-- =====================================================
-- スライドPDFを署名付きURL配信へ切り替える (#89)
--
-- `slides` バケットは公開（public = true）かつオブジェクトキーが連番のため、
-- キーを推測すれば未認証者を含む誰でもPDFを取得できた。#86 のお試しユーザー向け
-- ロック表示（お試し非公開コンテンツの中身は見せない）と矛盾するため、
--   1. バケットを非公開化し、
--   2. `learning_contents.pdf_url` の保存値を公開URLからオブジェクトキーへ正規化し、
--   3. `storage.objects` の SELECT を「pdf_url がそのキーと一致する可視コンテンツが
--      存在する場合」に限定する（可視判定は learning_contents の RLS に委譲）。
--
-- 【重要】本マイグレーションはアプリコード側の署名付きURL配信（同PR）と同時に
-- リリースすること。旧コードは pdf_url に NEXT_PUBLIC_SUPABASE_URL を前置して
-- 公開URLを組み立てるため、正規化後の値では全スライドが表示できなくなる。
--
-- `slides` バケット自体はダッシュボードで手動作成されておりマイグレーション管理外
-- だったため、thumbnails と同じ INSERT ... ON CONFLICT で存在・非公開化の両方を保証する。
-- =====================================================

-- =====================================================
-- 1. バケットの非公開化
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('slides', 'slides', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- =====================================================
-- 2. pdf_url の正規化（公開URL → オブジェクトキー）
--
-- 対象は次の2形式のみ（本番・開発の実データで確認済み）。
--   - シード由来の相対パス:   /storage/v1/object/public/slides/gas/slide-01.pdf
--   - 管理画面由来の完全URL:  https://<project>.supabase.co/storage/v1/object/public/slides/gas/slide-01.pdf
-- いずれも接頭辞を落とすとオブジェクトキー（gas/slide-01.pdf）になる。
-- アプリ側の toSlideObjectKey()（app/lib/slide-object-key.ts）と同じ規則
-- （前後の空白・タブ・CR・LF を除去してから接頭辞を落とす）。
-- 正規化後の値が現在値と異なる行のみ UPDATE する（接頭辞の無い行も前後に空白があれば対象。
-- 正規化済みの行は更新しない（updated_at を動かさない）。NULL は対象外）。
-- ロールバック時は、pdf_url に '/storage/v1/object/public/slides/' を前置して戻すのに加え、
-- storage.buckets の slides を public = true に戻し、下記3節の4ポリシーを DROP する。
-- =====================================================

-- 正規化式はサブクエリで1回だけ書き、SET と WHERE で同じ値を参照する
-- （式を片方だけ直して WHERE が一致しなくなる事故を防ぐ）。
UPDATE public.learning_contents lc
SET pdf_url = n.normalized
FROM (
  SELECT
    id,
    regexp_replace(btrim(pdf_url, E' \t\r\n'), '^(https?://[^/]+)?/storage/v1/object/public/slides/', '') AS normalized
  FROM public.learning_contents
  WHERE pdf_url IS NOT NULL
) n
WHERE lc.id = n.id
  AND lc.pdf_url <> n.normalized;

-- 正規化後もオブジェクトキーとして解釈できない値（外部URL・`/` 始まり）が残っていれば
-- 適用を中断する。残すと Storage ポリシーの等値比較が成立せず、そのスライドは受講生に
-- 「表示できません」と出続ける。本番・開発の実データでは該当0件を確認済み。
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.learning_contents
  WHERE pdf_url IS NOT NULL AND pdf_url ~ '^([a-zA-Z][a-zA-Z0-9+.-]*:|/)';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'learning_contents.pdf_url にオブジェクトキーとして解釈できない値が % 件あります。手動で修正してから再適用してください', bad_count;
  END IF;
END $$;

COMMENT ON COLUMN public.learning_contents.pdf_url IS
  'スライドPDFの slides バケット内オブジェクトキー（例: gas/slide-01.pdf）。配信時にサーバー側で署名付きURLを発行する';

-- =====================================================
-- 3. storage.objects ポリシー（slides バケット）
--
-- SELECT: admin / maintainer は無条件。それ以外は「pdf_url がこのオブジェクトキーと
-- 一致する公開済み learning_contents の行が（呼び出しユーザーの RLS 下で）見える」場合のみ。
-- ポリシー式内のサブクエリにも呼び出しユーザーの RLS が適用されるため、
-- learning_contents の SELECT ポリシー（is_published / is_deleted / status /
-- is_open_to_trial）がそのまま Storage の可視範囲になる。is_published / is_deleted は
-- RLS が既に絞り込むが、受講生向け経路の二層防御として明示する（CLAUDE.md の方針）。
-- anon（未認証）向けのポリシーは作らない（デモ画面はサーバー側で service_role により
-- お試し公開スライドのみ署名する）。
-- =====================================================

DROP POLICY IF EXISTS "Slides are viewable via visible contents or by content managers" ON storage.objects;
CREATE POLICY "Slides are viewable via visible contents or by content managers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'slides'
    AND (
      (select public.get_user_role()) IN ('admin', 'maintainer')
      OR EXISTS (
        SELECT 1 FROM public.learning_contents lc
        WHERE lc.pdf_url = storage.objects.name
          AND lc.is_published = true
          AND lc.is_deleted = false
      )
    )
  );

-- 書き込み系はコンテンツ管理者に限定する。
-- thumbnails（20260819000001）と slides で操作ごとに permissive ポリシーが2本並ぶと
-- Supabase advisor の multiple_permissive_policies が発火するため（CLAUDE.md「同一操作の
-- 許可ポリシーは OR 条件で1本に統合する」）、thumbnails 側のポリシーを DROP し、
-- 両バケットを対象にした1本へ統合する。
-- 現行のアップロードAPIは service_role で書き込むため必須ではないが、
-- 通常クライアントからの経路を将来追加しても壊れないよう揃えておく。
DROP POLICY IF EXISTS "Content managers can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Content managers can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Content managers can delete thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Content managers can upload slides" ON storage.objects;
DROP POLICY IF EXISTS "Content managers can update slides" ON storage.objects;
DROP POLICY IF EXISTS "Content managers can delete slides" ON storage.objects;

DROP POLICY IF EXISTS "Content managers can upload content assets" ON storage.objects;
CREATE POLICY "Content managers can upload content assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('thumbnails', 'slides')
    AND (select public.get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can update content assets" ON storage.objects;
CREATE POLICY "Content managers can update content assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('thumbnails', 'slides')
    AND (select public.get_user_role()) IN ('admin', 'maintainer')
  )
  WITH CHECK (
    bucket_id IN ('thumbnails', 'slides')
    AND (select public.get_user_role()) IN ('admin', 'maintainer')
  );

DROP POLICY IF EXISTS "Content managers can delete content assets" ON storage.objects;
CREATE POLICY "Content managers can delete content assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('thumbnails', 'slides')
    AND (select public.get_user_role()) IN ('admin', 'maintainer')
  );
