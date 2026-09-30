import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllThemes } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhaseForm } from "../PhaseForm";

export default async function NewPhasePage() {
  const [{ data: themes }, { data: phases, error: phasesError }] = await Promise.all([
    fetchAllThemes(),
    fetchAllPhases(),
  ]);

  // Treating a failed sibling fetch as "no siblings" would show an empty list although phases exist
  // under the selected theme, and submit with the default head insert. If the DB recovers by POST
  // time (renumbering inside createPhase), all existing phases would be renumbered backward
  // unintentionally, so don't show the form on failure.
  if (phasesError || !phases) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="フェーズ新規作成"
          breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: "新規作成" }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存フェーズの一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
  const siblingCandidates = [...phases]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((phase) => ({
      id: phase.id,
      label: phase.name,
      isPublished: phase.is_published,
      parentId: phase.theme_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ新規作成"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: "新規作成" }]}
      />
      <PhaseForm themes={themes ?? []} siblingCandidates={siblingCandidates} mode="create" />
    </div>
  );
}
