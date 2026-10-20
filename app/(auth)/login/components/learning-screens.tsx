import Image from "next/image";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { LOGIN_CLIP_URL } from "@/app/constants/login";

type Step = {
  title: string;
  description: string;
  src: string;
  alt: string;
  aspect: string;
};

// Screenshots of the real app screens (public/images/login/). The AI review and review list
// screens are cropped to results only, so they show no submission or model-answer code.
const STEPS: Step[] = [
  {
    title: "動画で学ぶ",
    description: "シンラビが解説する動画で、まず全体像をつかみます。",
    src: "/images/login/video.webp",
    alt: "解説動画のサムネイル",
    aspect: "aspect-video",
  },
  {
    title: "解説記事で読む",
    description: "要点とコード例を、自分のペースで読み返せます。",
    src: "/images/login/article.webp",
    alt: "解説記事の画面",
    aspect: "aspect-[959/392]",
  },
  {
    title: "課題を提出する",
    description: "学んだことを、コードを書いて提出します。",
    src: "/images/login/exercise.webp",
    alt: "課題提出の画面",
    aspect: "aspect-[16/10]",
  },
  {
    title: "AIがすぐにレビュー",
    description: "提出するとすぐに、達成度とコメントが届きます。",
    src: "/images/login/ai-review.webp",
    alt: "AIレビュー結果の画面",
    aspect: "aspect-[16/10]",
  },
  {
    title: "復習リストで振り返る",
    description: "部分的・未達成だった点が集まり、再提出で達成すると克服済みに移ります。",
    src: "/images/login/review-list.webp",
    alt: "復習リストの画面",
    aspect: "aspect-[16/10]",
  },
];

const FRAME =
  "relative overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_-16px_rgba(30,26,56,0.35)]";

export function LearningScreens() {
  return (
    <section aria-labelledby="learning-screens-heading" className="space-y-5 lg:space-y-6">
      <div className="space-y-1 lg:flex lg:items-baseline lg:gap-4 lg:space-y-0">
        <h2
          id="learning-screens-heading"
          className="text-xl font-extrabold lg:shrink-0 lg:text-2xl"
        >
          実際の学習画面
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground lg:text-sm">
          動画・解説記事で学び、課題を提出すると、すぐにAIのレビューが届きます。学んだことは復習リストで振り返れます。
        </p>
      </div>
      <ol className="mx-auto max-w-3xl space-y-10 lg:space-y-12">
        {STEPS.map(({ title, description, src, alt, aspect }, index) => (
          <li key={src} className="space-y-3">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                aria-hidden
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-base font-bold lg:text-lg">{title}</h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground lg:text-sm">
                  {description}
                </p>
              </div>
            </div>
            {index === 0 && LOGIN_CLIP_URL ? (
              <YouTubeEmbed url={LOGIN_CLIP_URL} className="border border-border shadow-md" />
            ) : (
              // Crop to a fixed frame anchored to the top so the top of the screen (title, start of
              // the body) is visible even for tall screenshots.
              <div className={`${FRAME} ${aspect}`}>
                <Image
                  src={src}
                  alt={alt}
                  fill
                  className="object-cover object-left-top"
                  sizes="(min-width: 768px) 768px, 100vw"
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
