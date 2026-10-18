import { Bot, CheckCircle, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import {
  CONTENT_TYPE_ACCENT_CLASSES,
  CONTENT_TYPE_BORDER_CLASSES,
  CONTENT_TYPE_LABEL_CLASSES,
  CONTENT_TYPE_LEARNER_LABELS,
  CONTENT_TYPE_THUMBNAILS,
} from "@/app/constants/content";
import type { ContentType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ContentTypeIllustration } from "./ContentTypeIllustration";

interface LearnContentCardProps {
  href: string;
  title: string;
  contentType: ContentType;
  /** 1-based position in the phase; a grid hides the reading order a list shows. */
  number: number;
  isPublished: boolean;
  locked: boolean;
  completed: boolean;
  aiReviewed: boolean;
}

export function LearnContentCard({
  href,
  title,
  contentType,
  number,
  isPublished,
  locked,
  completed,
  aiReviewed,
}: LearnContentCardProps) {
  const thumbnail = CONTENT_TYPE_THUMBNAILS[contentType];
  return (
    <Link href={href} className="block group h-full">
      <Card
        className={`h-full gap-0 overflow-hidden border-2 py-0 transition-all hover:shadow-md ${
          completed ? "border-success" : CONTENT_TYPE_BORDER_CLASSES[contentType]
        } ${locked ? "opacity-60" : ""}`}
      >
        <div
          className={`relative flex aspect-video items-center justify-center ${
            locked ? "bg-muted text-muted-foreground" : CONTENT_TYPE_ACCENT_CLASSES[contentType]
          }`}
        >
          {thumbnail ? (
            // Decorative: the type name is rendered as text below the thumbnail.
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 100vw"
              className={`object-cover ${locked ? "grayscale" : ""}`}
            />
          ) : (
            <ContentTypeIllustration type={contentType} className="h-full w-full p-3" />
          )}
          <span className="absolute left-2 top-2 rounded-full bg-card/80 px-2 py-0.5 text-xs font-medium text-foreground">
            {number}
          </span>
          {locked && (
            <Lock
              aria-label="有料会員向け"
              className="absolute right-2 top-2 h-6 w-6 rounded-full bg-card p-1 text-muted-foreground"
            />
          )}
          {completed && (
            <CheckCircle
              aria-label="完了"
              className="absolute right-2 top-2 h-5 w-5 rounded-full bg-card text-success"
            />
          )}
        </div>
        <div className="space-y-2 p-3">
          <p
            className={`text-base font-bold ${
              locked ? "text-muted-foreground" : CONTENT_TYPE_LABEL_CLASSES[contentType]
            }`}
          >
            {CONTENT_TYPE_LEARNER_LABELS[contentType]}
          </p>
          <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary transition-colors">
            {title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
            {locked && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Lock className="h-3 w-3" />
                有料会員向け
              </Badge>
            )}
            <UnpublishedBadge isPublished={isPublished} />
            {!locked && contentType === "exercise" && aiReviewed && (
              <Badge variant="outline" className="gap-1 text-xs border-primary/40 text-primary">
                <Bot className="h-3 w-3" />
                AIレビュー済み
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
