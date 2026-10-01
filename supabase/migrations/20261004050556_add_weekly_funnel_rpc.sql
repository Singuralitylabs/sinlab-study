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
--               登録+7日以内の submissions が1件以上（コホート。直近週は未確定）
--   upgraded    発生基準。stripe_subscription_id があり、status が active /
--               past_due / 終端（canceled, unpaid, paused）の行を created_at の週
--               に数える。後から解約してもその週の件数から消えない。
--               trialing / incomplete / incomplete_expired / checkout_pending は
--               active になっていないので含めない。手動承認の general は
--               この行を作らないので含まれない。
--               終端状態の定数は app/services/api/stripe-server.ts の
--               TERMINAL_SUBSCRIPTION_STATUSES と揃える（paused を含む）。
--   ended       発生基準。status が終端の行を updated_at の週に数える。
--               終端後に別の更新が updated_at を動かすと週がずれる（履歴列が無い）。
--   paid_total  週末時点の general かつ active の近似（状態履歴が無い）:
--               現在 general+active+未削除で、Stripe 行が契約中かつ created_at が
--               週末より前、または Stripe 行が無く updated_at が週末より前（手動承認。
--               承認後の別更新で updated_at が動くと過去週から外れる）。
--               いまはお試しに戻っていても、終端（incomplete_expired を除く）の
--               updated_at が週末以後かつ created_at が週末より前なら、週末時点では
--               有料だったとみなす。論理削除に deleted_at が無いので、削除済みは
--               全週から除く。
-- weeks は 1..104 に丸める（authenticated に GRANT するため巨大な generate_series を防ぐ）。
-- =====================================================

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
      WHERE ss.stripe_subscription_id IS NOT NULL
        AND ss.status IN ('active', 'past_due', 'canceled', 'unpaid', 'paused')
        AND ss.created_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND ss.created_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
    ) AS upgraded,
    (
      SELECT count(*)
      FROM public.stripe_subscriptions ss
      WHERE ss.status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused')
        AND ss.updated_at >= (w.week_start::timestamp AT TIME ZONE 'Asia/Tokyo')
        AND ss.updated_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
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
                ss.id IS NOT NULL
                AND ss.status NOT IN (
                  'canceled',
                  'unpaid',
                  'incomplete_expired',
                  'paused',
                  'checkout_pending'
                )
                AND ss.created_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
              )
              OR (
                ss.id IS NULL
                AND u.updated_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
              )
            )
          )
          OR (
            ss.stripe_subscription_id IS NOT NULL
            AND ss.status IN ('canceled', 'unpaid', 'paused')
            AND ss.created_at < (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
            AND ss.updated_at >= (w.week_end::timestamp AT TIME ZONE 'Asia/Tokyo')
          )
        )
    ) AS paid_total
  FROM week_rows w
  ORDER BY w.week_start;
$$;

REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated, service_role;
