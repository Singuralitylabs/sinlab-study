import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllWeeks } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WeekForm } from "../WeekForm";

export default async function NewWeekPage() {
  const [{ data: phases }, { data: weeks, error: weeksError }] = await Promise.all([
    fetchAllPhases(),
    fetchAllWeeks(),
  ]);

  // Treating a failed sibling fetch as "no siblings" would show an empty list although weeks exist
  // under the selected phase, and submit with the default head insert. If the DB recovers by POST
  // time (renumbering inside createWeek), all existing weeks would be renumbered backward
  // unintentionally, so don't show the form on failure.
  if (weeksError || !weeks) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="週新規作成"
          breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: "新規作成" }]}
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
    .map((week) => ({
      id: week.id,
      label: week.name,
      isPublished: week.is_published,
      parentId: week.phase_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="週新規作成"
        breadcrumbs={[{ label: "週管理", href: "/manage/weeks" }, { label: "新規作成" }]}
      />
      <WeekForm phases={phases ?? []} siblingCandidates={siblingCandidates} mode="create" />
    </div>
  );
}
