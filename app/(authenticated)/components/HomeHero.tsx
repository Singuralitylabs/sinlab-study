import Image from "next/image";

interface HomeHeroProps {
  /** null when the name could not be read; the greeting then drops the name instead of failing. */
  displayName: string | null;
}

export function HomeHero({ displayName }: HomeHeroProps) {
  const name = displayName?.trim();

  return (
    <section className="mb-6">
      {/* Full 16:9 below lg so the baked-in title is never cropped; from lg it is capped in height
          (cropping the mascot's lower body, which carries no text) so the cards below stay near the first view. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border lg:aspect-[8/3]">
        <Image
          src="/images/home/hero.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 896px, 100vw"
          className="object-cover object-[50%_20%]"
        />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl break-words">
        {name ? `おかえりなさい、${name}さん` : "おかえりなさい"}
      </h1>
      <p className="mt-2 text-muted-foreground">今日も少しずつ、続きから進めましょう</p>
    </section>
  );
}
