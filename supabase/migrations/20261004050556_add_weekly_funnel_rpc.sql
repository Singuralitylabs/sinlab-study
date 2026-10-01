-- =====================================================
-- 週次ファネル集計 RPC (#289)
--
-- /manage の「週次ファネル」が、登録・有効化・有料化・解約・週末の有料会員数を
-- 毎週同じ定義で見るための関数。アクセス解析（Vercel）とは別に、DB の実数を出す。
--
-- get_students_progress_summary と同じく SECURITY DEFINER は使わない。
-- プレーンな SQL 関数（SECURITY INVOKER）なので、呼び出し元の RLS に従う。
-- member が REST で直接呼んでも、users / submissions / stripe_subscriptions の
-- SELECT ポリシーが自分の行に限る。アプリは admin / maintainer を確認したあと
-- service_role で呼ぶ（stripe_subscriptions の SELECT は本人か admin だけで、
-- maintainer の JWT だと有料化・解約が過少になるため。SELECT ポリシー自体は
-- 広げない）。
--
-- 週境界は JST の月曜 0:00。timestamptz を Asia/Tokyo の壁時計にしてから
-- date_trunc('week') する（PostgreSQL の week は月曜始まり）。
-- 比較は「週初 <= ts < 翌週初」。
--
-- 列:
--   signups     users.created_at がその週、is_deleted = false
--   activated   その週の signups のうち、submitted_at が登録以上かつ
--               登録+7日以内の submissions が1件以上（コホート。週末登録の
--               7日が残る今週と前週は画面で未確定）
--   upgraded    発生基準。became_active_at（status が初めて active になった時刻）
--               がその週。Checkout の処理権は checkout_pending の INSERT で、
--               created_at はその時刻ではない。後から past_due / 終端になっても、
--               再契約で同じ行を checkout_pending に戻しても週は動かない。
--               active を一度も通っていない行（trialing のまま paused など）と
--               手動承認の general は含めない。1ユーザー1行なので2回目の active は
--               新しい発生として数えない。
--   ended       発生基準。became_active_at がある行の became_terminal_at
--               （active を経由したあと、status が初めて終端になった時刻）がその週。
--               終端は canceled / unpaid / incomplete_expired / paused
--               （TERMINAL_SUBSCRIPTION_STATUSES）。trialing → paused や
--               incomplete → incomplete_expired など、一度も active になっていない
--               行は有料化に無いので解約にも入れない。後続のミラー更新で updated_at
--               が動いても、再契約で status が戻っても週は動かない。2回目以降の
--               終端は同じ行では数えない。
--   paid_total  週末時点の general かつ active の近似（途中の空白期間は履歴が無い）:
--               現在 general+active+未削除で、became_active_at が週末より前かつ
--               いま終端でも checkout_pending でもない、または Stripe 行が無い /
--               終端 / checkout_pending で updated_at が週末より前（手動承認。
--               解約後や手続き中断後に承認した行も拾う。承認後の別更新で
--               updated_at が動くと過去週から外れる）。
--               いま終端でも、became_active_at が週末より前かつ became_terminal_at が
--               週末以後なら、その週末までは有料だったとみなす。再契約で現在 active
--               の行は、最初の became_active_at 以降の空白週も有料に見える。
--               論理削除に deleted_at が無いので、削除済みは全週から除く。
--
-- 既存行の埋め戻し: トリガー導入前は遷移時刻を持たない。subscription id があり
-- status = active、または status = past_due かつ users が general の行は
-- became_active_at = created_at（処理権の週に寄ることがある）。past_due を
-- 空のままだと、支払い回復で active に戻った週が新しい有料化になる。general
-- でない past_due は昇格していないので埋めない。終端行は active を経由したか
-- 分からないので
-- became_active_at を埋めず、became_terminal_at の埋め戻しも対象外にする
-- （未課金の解約週を付けない。初回適用では終端行の解約週は空のまま）。
-- 導入後は active の初回だけトリガーが now() で became_active_at を固定し、
-- 終端の初回は became_active_at があるときだけ残す。
-- weeks は 1..104 に丸める（authenticated に GRANT するため巨大な generate_series を防ぐ）。
-- =====================================================

ALTER TABLE public.stripe_subscriptions
  ADD COLUMN IF NOT EXISTS became_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS became_terminal_at TIMESTAMPTZ;

COMMENT ON COLUMN public.stripe_subscriptions.became_active_at IS
  'status が初めて active になった時刻。後続の更新や再契約では動かさない（週次ファネルの有料化）';
COMMENT ON COLUMN public.stripe_subscriptions.became_terminal_at IS
  'active を経由した行が初めて終端（canceled/unpaid/incomplete_expired/paused）になった時刻。後続の更新や再契約では動かさない（週次ファネルの解約）';

-- トリガーより先に埋める。updated_at トリガーを止める（埋め戻しで全行の updated_at を
-- マイグレーション時刻にしない。became_terminal_at は埋め戻し前の updated_at を使う）。
ALTER TABLE public.stripe_subscriptions DISABLE TRIGGER update_stripe_subscriptions_updated_at;

UPDATE public.stripe_subscriptions AS ss
SET became_active_at = ss.created_at
FROM public.users AS u
WHERE ss.user_id = u.id
  AND ss.became_active_at IS NULL
  AND ss.stripe_subscription_id IS NOT NULL
  AND (
    ss.status = 'active'
    OR (
      ss.status = 'past_due'
      AND u.membership_type = 'general'
      AND u.is_deleted = false
    )
  );

UPDATE public.stripe_subscriptions
SET became_terminal_at = updated_at
WHERE became_terminal_at IS NULL
  AND became_active_at IS NOT NULL
  AND status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused');

ALTER TABLE public.stripe_subscriptions ENABLE TRIGGER update_stripe_subscriptions_updated_at;

CREATE OR REPLACE FUNCTION public.stamp_stripe_subscription_funnel_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- created_at は checkout_pending の INSERT 時刻なので、active への遷移で別列に残す。
  IF NEW.status = 'active' AND NEW.became_active_at IS NULL THEN
    NEW.became_active_at := now();
  END IF;
  -- updated_at は毎回動く。有料化済みの終端初回だけ残す。未課金の paused /
  -- incomplete_expired を先に刻むと、後の本解約が週を動かせない。
  IF NEW.status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused')
     AND NEW.became_active_at IS NOT NULL
     AND NEW.became_terminal_at IS NULL THEN
    NEW.became_terminal_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_stripe_subscription_funnel_times ON public.stripe_subscriptions;
CREATE TRIGGER stamp_stripe_subscription_funnel_times
  BEFORE INSERT OR UPDATE ON public.stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_stripe_subscription_funnel_times();

REVOKE ALL ON FUNCTION public.stamp_stripe_subscription_funnel_times() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer DEFAULT 8)
RETURNS TABLE (
  week_start date,
  signups bigint,
  activated bigint,
  upgraded bigint,
  ended bigint,
  paid_total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      LEAST(GREATEST(COALESCE(weeks, 8), 1), 104)::integer AS week_count,
      (date_trunc('week', timezone('Asia/Tokyo', now())))::date AS this_monday
  ),
  week_rows AS (
    SELECT
      (p.this_monday - (gs.i * 7))::date AS week_start,
      (p.this_monday - (gs.i * 7) + 7)::date AS week_end
    FROM params p
    CROSS JOIN LATERAL generate_series(0, p.week_count - 1) AS gs(i)
  )
  SELECT
    w.week_start,
    (
      SELECT count(*)
      FROM public.users u
      WHERE u.is_deleted = false
        AND u.created_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND u.created_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
    ) AS signups,
    (
      SELECT count(*)
      FROM public.users u
      WHERE u.is_deleted = false
        AND u.created_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND u.created_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND EXISTS (
          SELECT 1
          FROM public.submissions s
          WHERE s.user_id = u.id
            AND s.submitted_at >= u.created_at
            AND s.submitted_at <= u.created_at + interval '7 days'
        )
    ) AS activated,
    (
      SELECT count(*)
      FROM public.stripe_subscriptions ss
      WHERE ss.became_active_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND ss.became_active_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
    ) AS upgraded,
    (
      SELECT count(*)
      FROM public.stripe_subscriptions ss
      WHERE ss.became_active_at IS NOT NULL
        AND ss.became_terminal_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND ss.became_terminal_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
    ) AS ended,
    (
      SELECT count(DISTINCT u.id)
      FROM public.users u
      LEFT JOIN public.stripe_subscriptions ss ON ss.user_id = u.id
      WHERE u.is_deleted = false
        AND (
          (
            u.status = 'active'
            AND u.membership_type = 'general'
            AND (
              (
                ss.became_active_at IS NOT NULL
                AND ss.became_active_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
                AND ss.status NOT IN (
                  'canceled',
                  'unpaid',
                  'incomplete_expired',
                  'paused',
                  'checkout_pending'
                )
              )
              OR (
                (
                  ss.id IS NULL
                  OR ss.status IN (
                    'canceled',
                    'unpaid',
                    'incomplete_expired',
                    'paused',
                    'checkout_pending'
                  )
                )
                AND u.updated_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
              )
            )
          )
          OR (
            ss.became_active_at IS NOT NULL
            AND ss.became_active_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
            AND ss.became_terminal_at >= (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
          )
        )
    ) AS paid_total
  FROM week_rows w
  ORDER BY w.week_start;
$$;

REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated, service_role;
