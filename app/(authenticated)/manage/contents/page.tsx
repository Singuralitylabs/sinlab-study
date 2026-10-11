import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import {
  deriveWeekSelectOptions,
  filterContents,
  isContentType,
} from "@/app/lib/content-filtering";
import {
  groupContentsByWeek,
  sortContentsByHierarchy,
  sortWeeksByHierarchy,
  toContentTableGroups,
} from "@/app/lib/content-grouping";
import {
  fetchAllContents,
  fetchAllWeeks,
  hasAnyManageContents,
} from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContentsFilterBar } from "./ContentsFilterBar";
import { ContentsTable } from "./ContentsTable";

interface AdminContentsPageProps {
  // App Router searchParams can be string[] when a query name is repeated.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** When a repeated query becomes string[], use only the first value. */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminContentsPage({ searchParams }: AdminContentsPageProps) {
  const params = await searchParams;
  const filters = {
    theme: firstParam(params.theme),
    phase: firstParam(params.phase),
    week: firstParam(params.week),
    type: firstParam(params.type),
    // Whitespace-only q means no filter (same decision as the trim in filterContents).
    q: firstParam(params.q).trim(),
  };

  // Theme/phase/week/type are filtered in SQL; only the title search stays in JS (#196). Filter
  // options derive from the (light) week list so structural filters don't fetch everything twice.
  const structuralFilters = {
    themeId: filters.theme || undefined,
    phaseId: filters.phase || undefined,
    weekId: filters.week || undefined,
    contentType: isContentType(filters.type) ? filters.type : undefined,
  };
  const hasStructuralFilter = Object.values(structuralFilters).some((value) => value !== undefined);
  const isFiltered = hasStructuralFilter || filters.q !== "";

  const [listResult, weeksResult, anyContentsResult] = await Promise.all([
    fetchAllContents(structuralFilters),
    fetchAllWeeks(),
    hasAnyManageContents(),
  ]);

  if (listResult.error || weeksResult.error || anyContentsResult.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageTitle title="コンテンツ管理" description="学習コンテンツの作成・編集・削除" />
        <Alert variant="destructive">
          <AlertDescription>
            コンテンツ一覧の取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const contents = listResult.data;
  const hasAnyContents = anyContentsResult.data === true;
  const filterOptions = deriveWeekSelectOptions(
    weeksResult.data ? sortWeeksByHierarchy(weeksResult.data) : []
  );

  const sortedContents = contents ? sortContentsByHierarchy(contents) : [];
  const filteredContents = filterContents(sortedContents, {
    q: filters.q || undefined,
  });
  const groups = groupContentsByWeek(filteredContents);
  const tableGroups = toContentTableGroups(groups);

  const newContentQuery = new URLSearchParams();
  if (filters.theme) newContentQuery.set("theme", filters.theme);
  if (filters.phase) newContentQuery.set("phase", filters.phase);
  if (filters.week) newContentQuery.set("week", filters.week);
  const newContentQueryString = newContentQuery.toString();
  const newContentHref = newContentQueryString
    ? `/manage/contents/new?${newContentQueryString}`
    : "/manage/contents/new";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="コンテンツ管理" description="学習コンテンツの作成・編集・削除" />
        <Button asChild>
          <Link href={newContentHref}>
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {!hasAnyContents ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">コンテンツがまだ登録されていません。</p>
            <Button asChild className="mt-4">
              <Link href="/manage/contents/new">最初のコンテンツを作成</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Suspense fallback={null}>
            <ContentsFilterBar
              themes={filterOptions.themes}
              phases={filterOptions.phases}
              weeks={filterOptions.weeks}
            />
          </Suspense>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">この条件のコンテンツはありません。</p>
                {isFiltered && (
                  <Button asChild variant="outline" className="mt-4">
                    <Link href="/manage/contents">フィルタをクリア</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ContentsTable groups={tableGroups} />
          )}
        </>
      )}
    </div>
  );
}
