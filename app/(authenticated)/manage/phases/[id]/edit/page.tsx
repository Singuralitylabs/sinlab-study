import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllThemes, fetchPhaseById } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhaseForm } from "../../PhaseForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPhasePage({ params }: PageProps) {
  const { id } = await params;
  const phaseId = Number.parseInt(id, 10);

  if (Number.isNaN(phaseId)) {
    notFound();
  }

  const [{ data: phase }, { data: themes }, { data: phases, error: phasesError }] =
    await Promise.all([fetchPhaseById(phaseId), fetchAllThemes(), fetchAllPhases()]);

  if (!phase) {
    notFound();
  }

  // Treating a failed sibling fetch (all phases, including itself) as "no siblings" would leave the
  // current position unknown and default the insert picker to the head. If the DB recovers by PUT
  // time (renumbering inside updatePhase), all existing phases would be renumbered backward
  // unintentionally, so don't show the form on failure (same policy as new/page.tsx).
  if (phasesError || !phases) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="フェーズ編集"
          breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: phase.name }]}
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
    .map((p) => ({
      id: p.id,
      label: p.name,
      isPublished: p.is_published,
      parentId: p.theme_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ編集"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: phase.name }]}
      />
      <PhaseForm
        themes={themes ?? []}
        initialData={phase}
        siblingCandidates={siblingCandidates}
        mode="edit"
      />
    </div>
  );
}
