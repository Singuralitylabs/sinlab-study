"use client";

import { CheckCircle, Clock, FileText, Lock, PenLine, Play, Presentation } from "lucide-react";
import Link from "next/link";
import type { LearningContent } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDemoProgress } from "../hooks/useDemoProgress";

interface DemoContentListProps {
  contents: LearningContent[];
  themeId: number;
  phaseId: number;
  weekId: number;
  locked?: boolean;
}

function getContentIcon(type: string) {
  switch (type) {
    case "video":
      return <Play className="h-4 w-4" />;
    case "exercise":
      return <PenLine className="h-4 w-4" />;
    case "slide":
      return <Presentation className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getContentTypeLabel(type: string) {
  switch (type) {
    case "video":
      return "動画";
    case "text":
      return "テキスト";
    case "exercise":
      return "演習";
    case "slide":
      return "スライド";
    default:
      return type;
  }
}

export function DemoContentList({
  contents,
  themeId,
  phaseId,
  weekId,
  locked = false,
}: DemoContentListProps) {
  const { isCompleted } = useDemoProgress();

  return (
    <div className="grid gap-2 ml-5 border-l-2 border-border pl-5">
      {contents.map((content) => {
        const completed = !locked && isCompleted(content.id);

        return (
          <Link
            key={content.id}
            href={`/demo/${themeId}/${phaseId}/${weekId}/${content.id}`}
            className="block group"
          >
            <Card
              className={`transition-all hover:shadow-sm hover:border-primary/20 ${
                completed ? "border-l-4 border-l-success" : ""
              } ${locked ? "opacity-75" : ""}`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-full shrink-0 ${
                      locked
                        ? "bg-muted text-muted-foreground"
                        : completed
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {locked ? (
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
                        locked
                          ? "text-muted-foreground"
                          : "group-hover:text-primary transition-colors"
                      }`}
                    >
                      {content.title}
                    </h3>
                  </div>
                  <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
                    {getContentIcon(content.content_type)}
                    {getContentTypeLabel(content.content_type)}
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
