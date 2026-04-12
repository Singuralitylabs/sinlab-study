import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllPhases, fetchWeekById } from "@/app/services/api/admin-server";
import { WeekForm } from "../../WeekForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditWeekPage({ params }: PageProps) {
  const { id } = await params;
  const weekId = Number.parseInt(id, 10);

  if (Number.isNaN(weekId)) {
    notFound();
  }

  const [{ data: week }, { data: phases }] = await Promise.all([
    fetchWeekById(weekId),
    fetchAllPhases(),
  ]);

  if (!week) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="週編集"
        breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: week.name }]}
      />
      <WeekForm phases={phases ?? []} initialData={week} mode="edit" />
    </div>
  );
}
