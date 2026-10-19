import Image from "next/image";

interface HomeHeroProps {
  /** null when the name could not be read; the greeting then drops the name instead of failing. */
  displayName: string | null;
}

export function HomeHero({ displayName }: HomeHeroProps) {
  const name = displayName?.trim();

  return (
    <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0 lg:flex-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl break-words">
          {name ? `おかえりなさい、${name}さん` : "おかえりなさい"}
        </h1>
        <p className="mt-2 text-muted-foreground">今日も少しずつ、続きから進めましょう</p>
      </div>
      {/* Fixed-size box so the image never reflows the cards below it; narrow on mobile so the baked-in text is not cropped and the cards below stay near the first view. */}
      <div className="relative aspect-video w-full max-w-72 overflow-hidden rounded-xl border lg:w-[22rem] lg:max-w-none lg:shrink-0">
        <Image
          src="/images/home/hero.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 352px, 288px"
          className="object-cover"
        />
      </div>
    </section>
  );
}
