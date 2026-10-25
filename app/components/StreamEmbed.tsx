"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface StreamEmbedProps {
  iframeSrc: string;
  thumbnailSrc: string;
  className?: string;
}

/**
 * Facade like YouTubeEmbed: before click only the (token-signed) thumbnail loads from Cloudflare;
 * after click the Stream iframe is mounted with autoplay in its URL.
 */
export function StreamEmbed({ iframeSrc, thumbnailSrc, className }: StreamEmbedProps) {
  const [activated, setActivated] = useState(false);

  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-xl bg-black", className)}>
      {activated ? (
        <iframe
          src={iframeSrc}
          title="講座動画"
          className="h-full w-full rounded-xl border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setActivated(true)}
          className="relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="動画を再生"
        >
          {/* biome-ignore lint/performance/noImgElement: token-signed Stream thumbnail must not go through the Next Image Optimizer */}
          <img
            src={thumbnailSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <span
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
            aria-hidden
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg">
              <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-white" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
