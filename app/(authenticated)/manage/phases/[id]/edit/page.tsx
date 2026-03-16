import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllThemes, fetchPhaseById } from "@/app/services/api/admin-server";
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

  const [{ data: phase }, { data: themes }] = await Promise.all([
    fetchPhaseById(phaseId),
    fetchAllThemes(),
  ]);

  if (!phase) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ編集"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: phase.name }]}
      />
      <PhaseForm themes={themes ?? []} initialData={phase} mode="edit" />
    </div>
  );
}
