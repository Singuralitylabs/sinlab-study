"use client";

import { ChevronDown, Info } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WEEKLY_FUNNEL_WEEK_OPTIONS } from "@/app/constants/analytics";
import { isActivationCohortOpen, type WeeklyFunnelRow } from "@/app/lib/weekly-funnel";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

const COLUMN_HELP = {
  week: "月曜始まり（JST）。",
  signups: "その週に登録したユーザー数。",
  activated:
    "その週の登録者のうち、登録から7日以内に提出が1件以上ある人数。今週と前週は7日が終わっていない人がいるため未確定。",
  upgraded:
    "Stripe の契約が初めて有効になった週の件数。その後解約しても消えない。手動承認は含まない。",
  ended:
    "有料契約が初めて終端（canceled / unpaid など）になった週の件数。一度も active になっていない行は含めない。",
  paidTotal:
    "各週末時点で有料会員（membership_type = general かつ status = active）とみなせる人数の近似。",
} as const;

function ColumnHelp({ label, description }: { label: string; description: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label}の説明`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <p>{description}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

export function WeeklyFunnelCard({
  rows,
  errorMessage,
  weeks,
  now = new Date(),
}: {
  rows: WeeklyFunnelRow[];
  errorMessage: string | null;
  weeks: number;
  now?: Date;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleWeeksChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "8") {
      params.delete("weeks");
    } else {
      params.set("weeks", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Card className="mb-8">
      <CardContent className="pt-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-lg font-semibold">週次ファネル</h2>
              <p className="text-sm text-muted-foreground">クリックして展開（既定は折りたたみ）</p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="funnel-weeks" className="text-sm text-muted-foreground">
                表示期間
              </label>
              <select
                id="funnel-weeks"
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={String(weeks)}
                onChange={(e) => handleWeeksChange(e.target.value)}
              >
                {WEEKLY_FUNNEL_WEEK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    直近{option}週
                  </option>
                ))}
              </select>
            </div>

            {errorMessage ? (
              <p className="text-muted-foreground">{errorMessage}</p>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground">表示できる週がありません。</p>
            ) : (
              <div className={cn("max-h-[28rem] overflow-auto rounded-md border")}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">
                        <ColumnHelp label="週" description={COLUMN_HELP.week} />
                      </TableHead>
                      <TableHead scope="col">
                        <ColumnHelp label="登録数" description={COLUMN_HELP.signups} />
                      </TableHead>
                      <TableHead scope="col">
                        <ColumnHelp label="初回提出数" description={COLUMN_HELP.activated} />
                      </TableHead>
                      <TableHead scope="col">
                        <ColumnHelp label="有料化数" description={COLUMN_HELP.upgraded} />
                      </TableHead>
                      <TableHead scope="col">
                        <ColumnHelp label="解約数" description={COLUMN_HELP.ended} />
                      </TableHead>
                      <TableHead scope="col">
                        <ColumnHelp label="有料会員数" description={COLUMN_HELP.paidTotal} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.weekStart}>
                        <TableCell>{formatWeekStart(row.weekStart)}</TableCell>
                        <TableCell>{formatCount(row.signups)}</TableCell>
                        <TableCell>
                          {formatCount(row.activated)}
                          {isActivationCohortOpen(row.weekStart, now) ? (
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
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
