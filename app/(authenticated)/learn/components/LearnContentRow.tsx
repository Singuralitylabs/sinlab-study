import { Bot, CheckCircle, Lock } from "lucide-react";
import Link from "next/link";
import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import {
  CONTENT_TYPE_ACCENT_CLASSES,
  CONTENT_TYPE_LEARNER_LABELS,
  toLearnerDisplayType,
} from "@/app/constants/content";
import type { ContentType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface LearnContentRowProps {
  href: string;
  title: string;
  contentType: ContentType;
  isPublished: boolean;
  locked: boolean;
  completed: boolean;
  aiReviewed: boolean;
}

export function LearnContentRow({
  href,
  title,
  contentType,
  isPublished,
  locked,
  completed,
  aiReviewed,
}: LearnContentRowProps) {
  return (
    <Link href={href} className="block group">
      <Card
        className={`transition-all hover:shadow-sm hover:border-primary/20 ${
          completed ? "border-l-4 border-l-success" : ""
        } ${locked ? "opacity-60" : ""}`}
      >
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div
              className={`relative p-1.5 rounded-full shrink-0 ${
                locked ? "bg-muted text-muted-foreground" : CONTENT_TYPE_ACCENT_CLASSES[contentType]
              }`}
            >
              {locked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <ContentTypeIcon type={toLearnerDisplayType(contentType)} className="h-4 w-4" />
              )}
              {completed && (
                <CheckCircle
                  aria-label="完了"
                  className="absolute -right-1 -bottom-1 h-3.5 w-3.5 rounded-full bg-card text-success"
                />
              )}
            </div>
            <div className="flex-1 min-w-40">
              <h3 className="text-sm font-medium group-hover:text-primary transition-colors sm:truncate">
                {title}
              </h3>
            </div>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {CONTENT_TYPE_LEARNER_LABELS[contentType]}
            </Badge>
            {locked && (
              <Badge variant="outline" className="gap-1 shrink-0 text-xs">
                <Lock className="h-3 w-3" />
                有料会員向け
              </Badge>
            )}
            <UnpublishedBadge isPublished={isPublished} />
            {!locked && contentType === "exercise" && aiReviewed && (
              <Badge
                variant="outline"
                className="gap-1 shrink-0 text-xs border-primary/40 text-primary"
              >
                <Bot className="h-3 w-3" />
                AIレビュー済み
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
