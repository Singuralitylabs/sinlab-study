import { PageTitle } from "@/app/components/PageTitle";
import { derivePhaseSelectOptions } from "@/app/lib/content-filtering";
import {
  compareGroupLevel,
  sortContentsByHierarchy,
  sortPhasesByHierarchy,
} from "@/app/lib/content-grouping";
import { buildContentTree } from "@/app/lib/content-tree";
import {
  fetchAllContents,
  fetchAllPhases,
  fetchAllThemes,
  fetchContentSiblingCandidates,
} from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentTree } from "./ContentTree";

export default async function AdminContentsTreePage() {
  const [themesResult, phasesResult, listResult, siblingsResult] = await Promise.all([
    fetchAllThemes(),
    fetchAllPhases(),
    fetchAllContents(),
    fetchContentSiblingCandidates(),
  ]);

  if (themesResult.error || phasesResult.error || listResult.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageTitle title="構成ツリー" description="テーマ〜コンテンツの構成を編集します" />
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

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <PageTitle title="構成ツリー" description="テーマ〜コンテンツの構成を1画面で編集します" />

      <section className="space-y-3">
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
    </div>
  );
}
