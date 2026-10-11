import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllWeeks, fetchWeekById } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const [{ data: week }, { data: phases }, { data: weeks, error: weeksError }] = await Promise.all([
    fetchWeekById(weekId),
    fetchAllPhases(),
    fetchAllWeeks(),
  ]);

  if (!week) {
    notFound();
  }

  // Treating a failed sibling fetch (all weeks, including itself) as "no siblings" would leave the
  // current position unknown and default the insert picker to the head. If the DB recovers by PUT
  // time (renumbering inside updateWeek), all existing weeks would be renumbered backward
  // unintentionally, so don't show the form on failure (same policy as new/page.tsx).
  if (weeksError || !weeks) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="週編集"
          breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: week.name }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存週の一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
  const siblingCandidates = [...weeks]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((w) => ({
      id: w.id,
      label: w.name,
      isPublished: w.is_published,
      parentId: w.phase_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="週編集"
        breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: week.name }]}
      />
      <WeekForm
        phases={phases ?? []}
        initialData={week}
        siblingCandidates={siblingCandidates}
        mode="edit"
      />
    </div>
  );
}
