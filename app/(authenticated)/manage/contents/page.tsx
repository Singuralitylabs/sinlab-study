import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import { deriveFilterOptions, filterContents } from "@/app/lib/content-filtering";
import {
  groupContentsByWeek,
  sortContentsByHierarchy,
  toContentTableGroups,
} from "@/app/lib/content-grouping";
import { fetchAllContents } from "@/app/services/api/admin-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContentsFilterBar } from "./ContentsFilterBar";
import { ContentsTable } from "./ContentsTable";

interface AdminContentsPageProps {
  // App RouterのsearchParamsは同名クエリの重複時に string[] にもなりうる
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** 同名クエリが重複して string[] になった場合は先頭の値のみを使う */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminContentsPage({ searchParams }: AdminContentsPageProps) {
  const params = await searchParams;
  const { data: contents } = await fetchAllContents();
  const sortedContents = contents ? sortContentsByHierarchy(contents) : [];
  const filterOptions = deriveFilterOptions(sortedContents);

  const filters = {
    theme: firstParam(params.theme),
    phase: firstParam(params.phase),
    week: firstParam(params.week),
    type: firstParam(params.type),
    // 空白のみのqは絞り込みなし扱い（filterContents側のtrimと判定を揃える）
    q: firstParam(params.q).trim(),
  };
  const isFiltered = Object.values(filters).some((value) => value !== "");

  const filteredContents = filterContents(sortedContents, {
    themeId: filters.theme || undefined,
    phaseId: filters.phase || undefined,
    weekId: filters.week || undefined,
    type: filters.type || undefined,
    q: filters.q || undefined,
  });
  const groups = groupContentsByWeek(filteredContents);
  const tableGroups = toContentTableGroups(groups);

  // 一覧の階層フィルタ（テーマ/フェーズ/週）を新規作成フォームの初期選択に引き継ぐ
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

      {!contents || contents.length === 0 ? (
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
