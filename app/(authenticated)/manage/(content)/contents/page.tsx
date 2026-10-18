import { Suspense } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import {
  derivePhaseSelectOptions,
  filterContents,
  isContentType,
} from "@/app/lib/content-filtering";
import {
  compareGroupLevel,
  groupContentsByPhase,
  sortContentsByHierarchy,
  sortPhasesByHierarchy,
  toContentTableGroups,
} from "@/app/lib/content-grouping";
import { buildContentTree } from "@/app/lib/content-tree";
import {
  fetchAllContents,
  fetchAllPhases,
  fetchAllThemes,
  fetchContentSiblingCandidates,
  hasAnyManageContents,
} from "@/app/services/api/admin-server";
import type { ManageContentListItem } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ContentsFilterBar } from "./ContentsFilterBar";
import { ContentsTable } from "./ContentsTable";
import { ContentTree } from "./ContentTree";

interface AdminContentsPageProps {
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

export default async function AdminContentsPage({ searchParams }: AdminContentsPageProps) {
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

  // One unfiltered contents fetch: the tree always shows the full hierarchy; the bulk table
  // applies structural + title filters in JS (#335 review).
  const [themesResult, phasesResult, listResult, siblingsResult, anyContentsResult] =
    await Promise.all([
      fetchAllThemes(),
      fetchAllPhases(),
      fetchAllContents(),
      fetchContentSiblingCandidates(),
      hasAnyManageContents(),
    ]);

  if (themesResult.error || phasesResult.error || listResult.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageTitle title="コンテンツ管理" description="学習コンテンツの構成・作成・編集・削除" />
        <Alert variant="destructive">
          <AlertDescription>
            コンテンツ構成の取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const themes = themesResult.data ?? [];
  const phases = phasesResult.data ?? [];
  const contents = listResult.data ?? [];
  const hasAnyContents = anyContentsResult.data === true;

  // Fail closed for create dialogs: missing sibling lists must not open an empty picker (#335 /
  // SiblingOrderField invariant).
  const formDataReady = {
    themes: Boolean(themesResult.data),
    phases: Boolean(phasesResult.data),
    contents: Boolean(siblingsResult.data),
  };
  const createBlocked = !formDataReady.themes || !formDataReady.phases || !formDataReady.contents;

  const sortedContents = sortContentsByHierarchy(contents);
  const tree = buildContentTree(themes, phases, sortedContents);
  const filterOptions = derivePhaseSelectOptions(sortPhasesByHierarchy(phases));

  const themeSiblings = [...themes]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((theme) => ({ id: theme.id, label: theme.name, isPublished: theme.is_published }));

  const phaseSiblingCandidates = [...phases]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((phase) => ({
      id: phase.id,
      label: phase.name,
      isPublished: phase.is_published,
      parentId: phase.theme_id,
    }));

  const contentSiblingCandidates = siblingsResult.data
    ? [...siblingsResult.data]
        .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
        .map((content) => ({
          id: content.id,
          label: content.title,
          isPublished: content.is_published,
          parentId: content.phase_id,
        }))
    : [];

  const tableContents = filterContents(
    filterContentsByStructure(sortedContents, structuralFilters),
    {
      q: filters.q || undefined,
    }
  );
  const groups = groupContentsByPhase(tableContents);
  const tableGroups = toContentTableGroups(groups);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageTitle title="コンテンツ管理" description="テーマ〜コンテンツの構成を1画面で編集します" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">構成ツリー</h2>
        {createBlocked && (
          <Alert variant="destructive">
            <AlertDescription>
              一覧の取得に失敗したため作成できません。時間をおいて再度お試しください。
            </AlertDescription>
          </Alert>
        )}
        <ContentTree
          tree={tree}
          themes={themes}
          themeSiblings={themeSiblings}
          phaseSiblingCandidates={phaseSiblingCandidates}
          contentSiblingCandidates={contentSiblingCandidates}
          contentFormThemes={filterOptions.themes}
          contentFormPhases={filterOptions.phases}
          formDataReady={formDataReady}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">コンテンツの一括操作</h2>
        <p className="text-sm text-muted-foreground">
          公開・非公開の切り替えや一括削除は、下の一覧から行えます。フィルタは一覧だけに効きます。
        </p>

        {!hasAnyContents && !anyContentsResult.error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                コンテンツがまだ登録されていません。上のツリーから作成してください。
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Suspense fallback={null}>
              <ContentsFilterBar themes={filterOptions.themes} phases={filterOptions.phases} />
            </Suspense>

            {groups.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">この条件のコンテンツはありません。</p>
                  {isFiltered && (
                    <p className="text-sm text-muted-foreground mt-2">
                      フィルタを変更してください。
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <ContentsTable groups={tableGroups} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
