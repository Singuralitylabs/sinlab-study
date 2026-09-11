"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

function extractVideoId(url: string): string | null {
  const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

const YouTubePlayerNoSSR = dynamic(
  () => import("@/app/components/YouTubePlayer").then((m) => m.YouTubePlayer),
  { ssr: false }
);

/**
 * lite-youtube-embed 相当の facade。
 * クリック前はサムネイルのみ表示し、youtube.com / ytimg.com（hqdefault 以外）へ通信しない。
 * クリック後に react-youtube を遅延読み込みし autoplay で再生を開始する。
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

  if (activated) {
    return (
      <div className={cn("aspect-video w-full", className)}>
        <YouTubePlayerNoSSR videoId={videoId} />
      </div>
    );
  }

  return (
    <div className={cn("aspect-video w-full", className)}>
      <button
        type="button"
        onClick={() => setActivated(true)}
        className="relative block h-full w-full overflow-hidden rounded-xl bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="動画を再生"
      >
        <Image
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 768px"
          priority={false}
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
    </div>
  );
}
