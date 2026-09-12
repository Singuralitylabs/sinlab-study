"use client";

import YouTube, { type YouTubeProps } from "react-youtube";

interface YouTubePlayerProps {
  videoId: string;
}

/** facade クリック後にのみ読み込む react-youtube ラッパー（autoplay 付き）。 */
export function YouTubePlayer({ videoId }: YouTubePlayerProps) {
  const opts: YouTubeProps["opts"] = {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 1,
      modestbranding: 1,
      rel: 0,
    },
  };

  return (
    <YouTube
      videoId={videoId}
      opts={opts}
      className="w-full h-full"
      iframeClassName="w-full h-full rounded-xl"
    />
  );
}
