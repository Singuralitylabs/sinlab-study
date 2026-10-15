import { ArrowRight, PlayCircle } from "lucide-react";
import Link from "next/link";
import { CONTENT_TYPE_LABELS } from "@/app/constants/content";
import type { ContinueLearningTarget } from "@/app/lib/continue-learning";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ContinueLearningCard({ target }: { target: ContinueLearningTarget }) {
  const percent =
    target.totalContents > 0
      ? Math.round((target.completedContents / target.totalContents) * 100)
      : 0;

  return (
    <Card className="mb-6 border-l-4 border-l-primary">
      <CardContent className="pt-6">
        <Link href={target.href} className="block group">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-full shrink-0">
              <PlayCircle className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground mb-1">続きから学習</p>
              <h2 className="text-lg font-semibold group-hover:text-primary transition-colors truncate">
                {target.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{target.themeName}</span>
                <Badge variant="secondary">{CONTENT_TYPE_LABELS[target.contentType]}</Badge>
                <span className="shrink-0">
                  {target.completedContents} / {target.totalContents}
                </span>
              </div>
              <Progress value={percent} className="h-2 mt-3" />
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0 mt-1" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
