import { ChevronDown } from "lucide-react";
import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { CONTENT_TYPE_LABELS } from "@/app/constants/content";
import type { ContentEngagementResult, EngagementGroupSummary } from "@/app/lib/content-engagement";
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

function GroupSummaryStats({ summary }: { summary: EngagementGroupSummary }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <div className="flex gap-1">
        <dt>コンテンツ数</dt>
        <dd className="font-medium text-foreground">{formatCount(summary.contentCount)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>取り組み人数</dt>
        <dd className="font-medium text-foreground">{formatCount(summary.viewedStudents)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>全完了人数</dt>
        <dd className="font-medium text-foreground">{formatCount(summary.finishedStudents)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>平均完了率</dt>
        <dd className="font-medium text-foreground">
          {formatPercent(summary.averageCompletionRate)}
        </dd>
      </div>
    </dl>
  );
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
            学習順に表示します。テーマ・フェーズをクリックすると開きます。分母は受講生全員（status =
            active・未削除）の
            {data ? ` ${data.studentTotal.toLocaleString("ja-JP")} 人` : ""}。個人名は出ません。
          </p>
        </div>

        {errorMessage ? (
          <p className="text-muted-foreground">{errorMessage}</p>
        ) : !data || data.themes.length === 0 ? (
          <p className="text-muted-foreground">表示できる公開コンテンツがありません。</p>
        ) : (
          <div className="space-y-3">
            {data.themes.map((theme) => (
              <details key={theme.themeId} className="group/theme rounded-md border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="space-y-1">
                    <h3 className="font-semibold">{theme.themeName}</h3>
                    <GroupSummaryStats summary={theme.summary} />
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open/theme:rotate-180" />
                </summary>
                <div className="space-y-2 border-t px-4 py-3">
                  {theme.phases.map((phase) => (
                    <details key={phase.phaseId} className="group/phase rounded-md border">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">{phase.phaseName}</h4>
                          <GroupSummaryStats summary={phase.summary} />
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/phase:rotate-180" />
                      </summary>
                      <div className="overflow-x-auto border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead scope="col">コンテンツ</TableHead>
                              <TableHead scope="col">種別</TableHead>
                              <TableHead scope="col" className="text-right">
                                閲覧人数
                              </TableHead>
                              <TableHead scope="col" className="text-right">
                                完了人数
                              </TableHead>
                              <TableHead scope="col" className="text-right">
                                完了率
                              </TableHead>
                              <TableHead scope="col" className="text-right">
                                提出人数
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
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
