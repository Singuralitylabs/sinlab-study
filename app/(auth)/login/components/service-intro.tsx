import type { LucideIcon } from "lucide-react";
import { ArrowRight, ExternalLink, Layers, MapIcon, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { FREE_TRIAL_FORM_URL, SERVICE_LP_URL } from "@/app/constants/marketing";
import { DISPLAY_MONTHLY_PRICE_JPY } from "@/app/constants/stripe";

type Feature = {
  icon: LucideIcon;
  /** 見出しの強調部分（LP と同じくアクセント色で表示）。無い見出しは `lead` のみ */
  lead: string;
  emphasis?: string;
  trail?: string;
  description: string;
};

// 文言は LP（SERVICE_LP_URL）の「4つの仕組み」からの引用（issue #264）。
// アプリの階層数（テーマ → フェーズ → 週 → コンテンツ）と LP の記載が異なるため、階層数には触れない
const FEATURES: Feature[] = [
  {
    icon: MapIcon,
    lead: "学習の",
    emphasis: "「地図」",
    trail: "が手に入る",
    description: "全体ロードマップで道筋が見え、次のステップが自動で提示される",
  },
  {
    icon: TrendingUp,
    lead: "進捗が",
    emphasis: "「見える」",
    trail: "から、やる気が続く",
    description: "ダッシュボードの進捗率・進捗バーで成長がビジュアルで見える",
  },
  {
    icon: Layers,
    lead: "動画 × テキスト × 演習で、理解を確実に定着させる",
    description: "「見るだけ」で終わらない、必ず手を動かす演習つき",
  },
  {
    icon: Sparkles,
    lead: "提出直後に",
    emphasis: "AI",
    trail: "が、あなたのコードをレビュー",
    description: "良い点と改善点をセットで即時フィードバック",
  },
];

const PILL_LINK_CLASS =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground px-5 text-sm font-bold transition-colors hover:bg-foreground/5 sm:h-11 sm:w-auto";

/** `/login` のサービス紹介（表示専用）。ログインの導線を優先するため、リンクは枠線・文字リンクに留める */
export function ServiceIntro() {
  const monthlyPrice = DISPLAY_MONTHLY_PRICE_JPY.toLocaleString("ja-JP");

  return (
    <section aria-labelledby="service-intro-heading" className="space-y-7">
      <div className="space-y-4">
        <h2
          id="service-intro-heading"
          className="text-[2rem] font-extrabold leading-snug tracking-tight lg:text-5xl lg:leading-tight"
        >
          「続かない」を、
          <br />
          <span className="text-primary">仕組み</span>で解決する
        </h2>
        <p className="text-[15px] leading-loose text-muted-foreground lg:text-base">
          学習の地図、進捗の見える化、AIによる即時レビュー。
          <br className="hidden lg:inline" />
          <strong className="font-bold text-foreground">一人でも挫折しない</strong>
          Web技術の学習環境を、シンラボがお届けします。
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {FEATURES.map(({ icon: Icon, lead, emphasis, trail, description }, index) => (
          <li
            key={lead}
            className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-extrabold tracking-widest text-accent-foreground">
                FEATURE {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="text-base font-extrabold leading-normal">
              {lead}
              {emphasis && <span className="text-primary">{emphasis}</span>}
              {trail}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground lg:text-[13px]">
              {description}
            </p>
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <p className="text-sm leading-relaxed lg:text-[15px]">
          まずは無料で始められます。全コンテンツの利用は月額
          <strong className="font-extrabold">{monthlyPrice}円</strong>（税込）。
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href="/demo" className={PILL_LINK_CLASS}>
            デモを試す
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href={FREE_TRIAL_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={PILL_LINK_CLASS}
          >
            無料体験会に申込む
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={SERVICE_LP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 px-2 text-sm font-bold text-primary underline underline-offset-4"
          >
            サービス紹介を見る
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
