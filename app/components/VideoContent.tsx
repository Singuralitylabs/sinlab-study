import { StreamEmbed } from "@/app/components/StreamEmbed";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { parseVideoSource } from "@/app/lib/video-source";
import type { StreamPlayback } from "@/app/services/api/stream-server";
import { Card, CardContent } from "@/components/ui/card";

interface VideoContentProps {
  videoUrl: string;
  /** Signed playback for a Stream UID; null when signing was refused or failed. */
  streamPlayback: StreamPlayback | null;
}

/** Picks the player by the stored video_url form (YouTube URL or Stream UID; #488). */
export function VideoContent({ videoUrl, streamPlayback }: VideoContentProps) {
  const source = parseVideoSource(videoUrl);

  if (source?.kind === "stream" && streamPlayback) {
    return <StreamEmbed {...streamPlayback} />;
  }
  if (source?.kind === "stream") {
    return (
      <Card className="bg-muted">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">動画を読み込めませんでした</p>
          <p className="text-sm text-muted-foreground mt-2">
            時間をおいて再読み込みしてください。解決しない場合は運営にお知らせください。
          </p>
        </CardContent>
      </Card>
    );
  }
  return <YouTubeEmbed url={videoUrl} />;
}
