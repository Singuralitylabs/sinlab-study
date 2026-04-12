import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllPhases } from "@/app/services/api/admin-server";
import { WeekForm } from "../WeekForm";

export default async function NewWeekPage() {
  const { data: phases } = await fetchAllPhases();

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="週新規作成"
        breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: "新規作成" }]}
      />
      <WeekForm phases={phases ?? []} mode="create" />
    </div>
  );
}
