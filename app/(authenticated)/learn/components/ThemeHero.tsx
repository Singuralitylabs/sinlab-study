import Image from "next/image";
import { resolveStorageUrl } from "@/app/lib/storage-url";

interface ThemeHeroProps {
  heroImageUrl: string | null;
  thumbnailUrl: string | null;
}

export function ThemeHero({ heroImageUrl, thumbnailUrl }: ThemeHeroProps) {
  // Themes without a dedicated wide image fall back to a center crop of the 16:9 thumbnail. That
  // can cut text out of the picture, which is what hero_image_url exists to avoid.
  const src = heroImageUrl || thumbnailUrl;
  if (!src) return null;

  return (
    // Decorative: the theme name is already the page heading.
    <div className="relative mb-6 h-36 overflow-hidden rounded-xl border bg-linear-to-br from-primary/5 to-primary/15 sm:h-auto sm:aspect-[16/5]">
      <Image
        src={resolveStorageUrl(src)}
        alt=""
        fill
        priority
        className="object-cover"
        sizes="(max-width: 896px) 100vw, 896px"
      />
    </div>
  );
}
