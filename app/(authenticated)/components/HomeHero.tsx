import Image from "next/image";

interface HomeHeroProps {
  /** null when the name could not be read; the greeting then drops the name instead of failing. */
  displayName: string | null;
}

export function HomeHero({ displayName }: HomeHeroProps) {
  const name = displayName?.trim();

  return (
    <section className="mb-6">
      {/* Built from tokens instead of a baked-in image so no course title is printed on it: シンラビ
          explains every theme, and a title in the picture would name only one. */}
      <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-xl border bg-gradient-to-br from-primary/15 via-background to-success/15 px-5 py-4 sm:px-8 sm:py-6">
        <div className="min-w-0">
          <p className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground sm:text-sm">
            Sinlab Study
          </p>
          <p className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
            シンラビと一緒に学ぼう
          </p>
        </div>
        <Image
          src="/images/mascot/shinrabi-congratulations.webp"
          alt=""
          width={160}
          height={160}
          priority
          className="h-24 w-24 shrink-0 sm:h-36 sm:w-36"
        />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl break-words">
        {name ? `おかえりなさい、${name}さん` : "おかえりなさい"}
      </h1>
      <p className="mt-2 text-muted-foreground">今日も少しずつ、続きから進めましょう</p>
    </section>
  );
}
