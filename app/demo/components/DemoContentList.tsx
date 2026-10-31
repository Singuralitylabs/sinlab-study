"use client";

import { CheckCircle, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { CONTENT_TYPE_LEARNER_LABELS, toLearnerDisplayType } from "@/app/constants/content";
import type { LearningContentListItem } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDemoProgress } from "../hooks/useDemoProgress";

interface DemoContentListProps {
  contents: LearningContentListItem[];
  themeId: number;
  phaseId: number;
  locked?: boolean;
}

export function DemoContentList({
  contents,
  themeId,
  phaseId,
  locked = false,
}: DemoContentListProps) {
  const { isCompleted } = useDemoProgress();

  return (
    <div className="grid gap-2">
      {contents.map((content) => {
        // Demo exposes only trial-open contents, like the slide signed URL; the rest stay locked.
        const itemLocked = locked || !content.is_open_to_trial;
        const completed = !itemLocked && isCompleted(content.id);

        return (
          <Link
            key={content.id}
            href={`/demo/${themeId}/${phaseId}/${content.id}`}
            className="block group"
          >
            <Card
              className={`transition-all hover:shadow-sm hover:border-primary/20 ${
                completed ? "border-l-4 border-l-success" : ""
              } ${itemLocked ? "opacity-75" : ""}`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-full shrink-0 ${
                      itemLocked
                        ? "bg-muted text-muted-foreground"
                        : completed
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {itemLocked ? (
                      <Lock className="h-4 w-4" />
                    ) : completed ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-sm font-medium truncate ${
                        itemLocked
                          ? "text-muted-foreground"
                          : "group-hover:text-primary transition-colors"
                      }`}
                    >
                      {content.title}
                    </h3>
                  </div>
                  <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
                    <ContentTypeIcon
                      type={toLearnerDisplayType(content.content_type)}
                      className="h-4 w-4"
                    />
                    {CONTENT_TYPE_LEARNER_LABELS[content.content_type]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
