import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { CONTENT_TYPE_LABELS } from "@/app/constants/content";
import type { ContentEngagementResult } from "@/app/lib/content-engagement";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPercent(rate: number | null): string {
  if (rate === null) return "-";
  return `${(rate * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
}

function formatCount(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("ja-JP");
}

export function ContentEngagementCard({
  data,
  errorMessage,
}: {
  data: ContentEngagementResult | null;
  errorMessage: string | null;
}) {
  return (
    <Card className="mb-8">
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">コンテンツ別の取り組み状況</h2>
          <p className="text-sm text-muted-foreground">
            完了率が低い順（同分は閲覧人数が少ない順）。分母は受講生全員（status =
            active・未削除）の
            {data ? ` ${data.studentTotal.toLocaleString("ja-JP")} 人` : ""}。個人名は出ません。
          </p>
        </div>

        {errorMessage ? (
          <p className="text-muted-foreground">{errorMessage}</p>
        ) : !data || data.themes.length === 0 ? (
          <p className="text-muted-foreground">表示できる公開コンテンツがありません。</p>
        ) : (
          <div className="space-y-6">
            {data.themes.map((theme) => (
              <section key={theme.themeId} className="space-y-3">
                <h3 className="font-semibold">{theme.themeName}</h3>
                {theme.phases.map((phase) => (
                  <div key={phase.phaseId} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{phase.phaseName}</h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead scope="col">コンテンツ</TableHead>
                            <TableHead scope="col">種別</TableHead>
                            <TableHead scope="col" className="text-right">
                              閲覧
                            </TableHead>
                            <TableHead scope="col" className="text-right">
                              完了
                            </TableHead>
                            <TableHead scope="col" className="text-right">
                              完了率
                            </TableHead>
                            <TableHead scope="col" className="text-right">
                              提出
                            </TableHead>
                            <TableHead scope="col" className="text-right">
                              合格率
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phase.contents.map((content) => (
                            <TableRow key={content.contentId}>
                              <TableCell className="font-medium">{content.title}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <ContentTypeIcon
                                    type={content.contentType}
                                    className="h-3.5 w-3.5"
                                  />
                                  {CONTENT_TYPE_LABELS[content.contentType]}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCount(content.viewedCount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCount(content.completedCount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatPercent(content.completionRate)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCount(content.submissionCount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatPercent(content.passRate)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
