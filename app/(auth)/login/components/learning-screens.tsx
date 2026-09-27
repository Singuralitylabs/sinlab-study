import Image from "next/image";

type Screen = {
  src: string;
  alt: string;
  caption: string;
};

// 実際のアプリ画面のスクリーンショット（public/images/login/）。
// 動画画面は講師のワイプ部分を塗りつぶして除去済み
const SCREENS: Screen[] = [
  { src: "/images/login/video.webp", alt: "動画コンテンツの画面", caption: "動画で学ぶ" },
  {
    src: "/images/login/slide.webp",
    alt: "スライドコンテンツの画面",
    caption: "スライドで確認する",
  },
  { src: "/images/login/exercise.webp", alt: "課題提出の画面", caption: "課題を提出する" },
  {
    src: "/images/login/ai-review.webp",
    alt: "AIレビュー結果の画面",
    caption: "AIがすぐにレビュー",
  },
];

/** `/login` の「実際の学習画面」。スマホは縦1列、タブレットは2列、PC は横4列で並べる */
export function LearningScreens() {
  return (
    <section aria-labelledby="learning-screens-heading" className="space-y-5 lg:space-y-6">
      <div className="space-y-1 lg:flex lg:items-baseline lg:gap-4 lg:space-y-0">
        <h2 id="learning-screens-heading" className="text-xl font-extrabold lg:text-2xl">
          実際の学習画面
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground lg:text-sm">
          動画・スライドで学び、課題を提出すると、すぐにAIのレビューが届きます。
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {SCREENS.map(({ src, alt, caption }) => (
          <li key={src}>
            <figure className="space-y-2.5">
              {/* 画面の上部（タイトル・本文の冒頭）が見えるよう、4:3 の枠に上寄せで切り出す */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_-16px_rgba(30,26,56,0.35)]">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  className="object-cover object-left-top"
                  sizes="(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <figcaption className="text-sm font-bold">{caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
