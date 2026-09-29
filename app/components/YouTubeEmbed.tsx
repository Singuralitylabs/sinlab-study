"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

function extractVideoId(url: string): string | null {
  // Allow a trailing slash while capturing only the ID (so `.../embed/abc123/` doesn't yield
  // //hqdefault).
  const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#/]+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function YouTubePlayerLoading() {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-xl bg-black"
      role="status"
    >
      <span className="sr-only">動画を読み込み中</span>
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}

const YouTubePlayerNoSSR = dynamic(
  () => import("@/app/components/YouTubePlayer").then((m) => m.YouTubePlayer),
  {
    ssr: false,
    loading: () => <YouTubePlayerLoading />,
  }
);

/**
 * Facade like lite-youtube-embed: before click it shows only the thumbnail and contacts no
 * youtube.com / ytimg.com
 * resource other than hqdefault; after click it lazy-loads react-youtube and autoplays. hqdefault
 * (480x360 JPEG)
 * is fetched straight from i.ytimg.com, bypassing the Next Image Optimizer (avoids source-image
 * quota use and spec drift).
 */
export function YouTubeEmbed({ url, className }: YouTubeEmbedProps) {
  const videoId = extractVideoId(url);
  const [activated, setActivated] = useState(false);

  if (!videoId) {
    return (
      <Card className={cn("bg-muted", className)}>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">動画を読み込めませんでした</p>
          <p className="text-sm text-muted-foreground mt-2">URL: {url}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-xl bg-black", className)}>
      {activated ? (
        <YouTubePlayerNoSSR videoId={videoId} />
      ) : (
        <button
          type="button"
          onClick={() => setActivated(true)}
          className="relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="動画を再生"
        >
          {/* biome-ignore lint/performance/noImgElement: hqdefault needs no Optimizer; references i.ytimg.com directly */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
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
