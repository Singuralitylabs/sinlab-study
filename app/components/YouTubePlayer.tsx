"use client";

import YouTube, { type YouTubeProps } from "react-youtube";

interface YouTubePlayerProps {
  videoId: string;
}

/** react-youtube wrapper loaded only after the facade click (with autoplay). */
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
