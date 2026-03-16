import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllThemes } from "@/app/services/api/admin-server";
import { PhaseForm } from "../PhaseForm";

export default async function NewPhasePage() {
  const { data: themes } = await fetchAllThemes();

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ新規作成"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: "新規作成" }]}
      />
      <PhaseForm themes={themes ?? []} mode="create" />
    </div>
  );
}
