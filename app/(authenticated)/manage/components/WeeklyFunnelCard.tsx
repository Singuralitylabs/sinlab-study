import type { WeeklyFunnelRow } from "@/app/lib/weekly-funnel";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatWeekStart(weekStart: string): string {
  const [year, month, day] = weekStart.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return weekStart;
  }
  return `${year}/${month}/${day}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

export function WeeklyFunnelCard({
  rows,
  errorMessage,
}: {
  rows: WeeklyFunnelRow[];
  errorMessage: string | null;
}) {
  const latestWeek = rows.reduce((max, row) => (row.weekStart > max ? row.weekStart : max), "");

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-1">週次ファネル</h2>
        <p className="text-sm text-muted-foreground mb-4">
          週は月曜始まり（JST）です。有効化は、その週に登録したユーザーのうち登録から7日以内に提出が1件以上ある人数です。直近の週は7日が経過していないため未確定です。有料化は
          Stripe
          の契約が初めて有効になった週の件数で、その後解約しても消えません。手動承認は含みません。
        </p>

        {errorMessage ? (
          <p className="text-muted-foreground">{errorMessage}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">表示できる週がありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">週</TableHead>
                <TableHead scope="col">登録</TableHead>
                <TableHead scope="col">有効化</TableHead>
                <TableHead scope="col">有料化</TableHead>
                <TableHead scope="col">解約</TableHead>
                <TableHead scope="col">有料会員数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.weekStart}>
                  <TableCell>{formatWeekStart(row.weekStart)}</TableCell>
                  <TableCell>{formatCount(row.signups)}</TableCell>
                  <TableCell>
                    {formatCount(row.activated)}
                    {row.weekStart === latestWeek ? (
                      <span className="ml-2 text-xs text-muted-foreground">未確定</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatCount(row.upgraded)}</TableCell>
                  <TableCell>{formatCount(row.ended)}</TableCell>
                  <TableCell>{formatCount(row.paidTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
