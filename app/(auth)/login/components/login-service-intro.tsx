import { LP_URL, TRIAL_EVENT_FORM_URL } from "@/app/constants/marketing";
import { DISPLAY_MONTHLY_PRICE_JPY } from "@/app/constants/stripe";

/** LP引用の4つの仕組み（見出し＋一言）。階層数・会員特典には言及しない */
const SERVICE_FEATURES = [
  {
    title: "学習の「地図」が手に入る",
    description: "全体ロードマップで道筋が見え、次のステップが自動で提示される",
  },
  {
    title: "進捗が「見える」から、やる気が続く",
    description: "ダッシュボードの進捗率・進捗バーで成長がビジュアルで見える",
  },
  {
    title: "動画 × テキスト × 演習で、理解を確実に定着させる",
    description: "「見るだけ」で終わらない、必ず手を動かす演習つき",
  },
  {
    title: "提出直後にAIが、あなたのコードをレビュー",
    description: "良い点と改善点をセットで即時フィードバック",
  },
] as const;

/**
 * `/login` のサービス紹介ブロック（表示専用の Server Component）。
 * 文言は LP からの引用で、issue #264 の「掲載文言」に固定する。
 * 料金は `STRIPE_ENABLED` に関わらず常に表示する。
 */
export function LoginServiceIntro() {
  const monthlyPrice = DISPLAY_MONTHLY_PRICE_JPY.toLocaleString("ja-JP");

  return (
    <section aria-label="サービス紹介" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">「続かない」を、仕組みで解決する</h2>
        <p className="text-sm text-muted-foreground">
          学習の地図、進捗の見える化、AIによる即時レビュー。一人でも挫折しないWeb技術の学習環境を、シンラボがお届けします。
        </p>
      </div>

      <ul className="space-y-4">
        {SERVICE_FEATURES.map((feature) => (
          <li key={feature.title} className="space-y-1">
            <p className="font-semibold">{feature.title}</p>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        まずは無料で始められます。全コンテンツの利用は月額{monthlyPrice}円（税込）。
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a
          href={LP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          サービス紹介を見る
        </a>
        <a href="/demo" className="text-primary hover:underline">
          デモを試す
        </a>
        <a
          href={TRIAL_EVENT_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          無料体験会に申込む
        </a>
      </div>
    </section>
  );
}
