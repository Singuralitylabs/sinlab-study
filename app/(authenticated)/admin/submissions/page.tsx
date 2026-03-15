import { ClipboardList, Code, ExternalLink, Link as LinkIcon } from "lucide-react";
import { AIReviewStatusBadge } from "@/app/components/AIReviewDisplay";
import { AIReviewDisplayClient } from "@/app/components/AIReviewDisplayClient";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllSubmissionsWithReviews } from "@/app/services/api/ai-review-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminSubmissionsPage() {
  const { data: submissions } = await fetchAllSubmissionsWithReviews();

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="提出一覧" description="全受講生の課題提出一覧" />

      {!submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">まだ提出がありません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card
              key={submission.id}
              className="transition-all hover:shadow-md hover:border-primary/20"
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-medium">{submission.user?.display_name}</p>
                    <p className="text-sm text-muted-foreground">{submission.user?.email}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(submission.submitted_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge variant="secondary" className="gap-1">
                    {submission.submission_type === "code" ? (
                      <Code className="h-3 w-3" />
                    ) : (
                      <LinkIcon className="h-3 w-3" />
                    )}
                    {submission.submission_type === "code" ? "コード提出" : "URL提出"}
                  </Badge>
                  <AIReviewStatusBadge review={submission.ai_review} />
                  <span className="text-sm font-medium">{submission.content?.title}</span>
                </div>

                {submission.submission_type === "code" && submission.code_content && (
                  <pre className="p-3 bg-muted rounded-lg text-sm overflow-x-auto max-h-40">
                    <code>{submission.code_content}</code>
                  </pre>
                )}

                {submission.submission_type === "url" &&
                  submission.url &&
                  (isValidUrl(submission.url) ? (
                    <a
                      href={submission.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {submission.url}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">{submission.url}</span>
                  ))}

                {submission.ai_review && <AIReviewDisplayClient review={submission.ai_review} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
