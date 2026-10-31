import { Suspense } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import {
  derivePhaseSelectOptions,
  filterContents,
  isContentType,
} from "@/app/lib/content-filtering";
import {
  groupContentsByPhase,
  sortContentsByHierarchy,
  sortPhasesByHierarchy,
  toContentTableGroups,
} from "@/app/lib/content-grouping";
import { MANAGE_CONTENTS_BULK_PATH } from "@/app/lib/manage-contents-paths";
import {
  fetchAllContents,
  fetchAllPhases,
  hasAnyManageContents,
} from "@/app/services/api/admin-server";
import type { ManageContentListItem } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ContentsFilterBar } from "../ContentsFilterBar";
import { ContentsTable } from "../ContentsTable";

interface AdminContentsBulkPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Apply the same structural filters as fetchAllContents SQL, for the bulk-ops table only. */
function filterContentsByStructure(
  contents: ManageContentListItem[],
  filters: {
    themeId?: string;
    phaseId?: string;
    contentType?: ManageContentListItem["content_type"];
  }
): ManageContentListItem[] {
  return contents.filter((content) => {
    if (filters.contentType && content.content_type !== filters.contentType) return false;
    if (filters.phaseId && String(content.phase?.id ?? "") !== filters.phaseId) return false;
    if (filters.themeId && String(content.phase?.theme?.id ?? "") !== filters.themeId) {
      return false;
    }
    return true;
  });
}

export default async function AdminContentsBulkPage({ searchParams }: AdminContentsBulkPageProps) {
  const params = await searchParams;
  const filters = {
    theme: firstParam(params.theme),
    phase: firstParam(params.phase),
    type: firstParam(params.type),
    q: firstParam(params.q).trim(),
  };

  const structuralFilters = {
    themeId: filters.theme || undefined,
    phaseId: filters.phase || undefined,
    contentType: isContentType(filters.type) ? filters.type : undefined,
  };
  const hasStructuralFilter = Object.values(structuralFilters).some((value) => value !== undefined);
  const isFiltered = hasStructuralFilter || filters.q !== "";

  const [phasesResult, listResult, anyContentsResult] = await Promise.all([
    fetchAllPhases(),
    fetchAllContents(),
    hasAnyManageContents(),
  ]);

  if (phasesResult.error || listResult.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageTitle title="コンテンツ一括操作" description="公開切替・削除・フィルタ" />
        <Alert variant="destructive">
          <AlertDescription>
            コンテンツ一覧の取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const phases = phasesResult.data ?? [];
  const contents = listResult.data ?? [];
  const hasAnyContents = anyContentsResult.data === true;

  const sortedContents = sortContentsByHierarchy(contents);
  const filterOptions = derivePhaseSelectOptions(sortPhasesByHierarchy(phases));

  const tableContents = filterContents(
    filterContentsByStructure(sortedContents, structuralFilters),
    {
      q: filters.q || undefined,
    }
  );
  const groups = groupContentsByPhase(tableContents);
  const tableGroups = toContentTableGroups(groups);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageTitle
        title="コンテンツ一括操作"
        description="公開・非公開の切り替えや一括削除は、下の一覧から行えます"
      />

      {!hasAnyContents && !anyContentsResult.error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              コンテンツがまだ登録されていません。構成ツリーから作成してください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Suspense fallback={null}>
            <ContentsFilterBar
              themes={filterOptions.themes}
              phases={filterOptions.phases}
              basePath={MANAGE_CONTENTS_BULK_PATH}
            />
          </Suspense>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">この条件のコンテンツはありません。</p>
                {isFiltered && (
                  <p className="text-sm text-muted-foreground mt-2">フィルタを変更してください。</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <ContentsTable groups={tableGroups} fromBulk />
          )}
        </>
      )}
    </div>
  );
}
