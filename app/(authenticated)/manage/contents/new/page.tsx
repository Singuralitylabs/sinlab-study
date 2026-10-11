import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { compareGroupLevel, sortWeeksByHierarchy } from "@/app/lib/content-grouping";
import { fetchAllWeeks, fetchContentSiblingCandidates } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentForm } from "../ContentForm";

interface NewContentPageProps {
  // App Router searchParams can be string[] when a query name is repeated.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** When a repeated query becomes string[], use only the first value. */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function NewContentPage({ searchParams }: NewContentPageProps) {
  const params = await searchParams;
  const [{ data: weeks }, { data: contents, error: contentsError }] = await Promise.all([
    fetchAllWeeks(),
    fetchContentSiblingCandidates(),
  ]);
  const sortedWeeks = weeks ? sortWeeksByHierarchy(weeks) : [];
  const filterOptions = deriveWeekSelectOptions(sortedWeeks);

  // Treating a failed sibling fetch as "no siblings" would show an empty list although contents
  // exist under the selected week, and submit with the default head insert. If the DB recovers by
  // POST time (renumbering inside createContent), all existing contents would be renumbered
  // backward unintentionally, so don't show the form on failure.
  if (contentsError || !contents) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="コンテンツ新規作成"
          breadcrumbs={[
            { label: "コンテンツ管理", href: "/manage/contents" },
            { label: "新規作成" },
          ]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存コンテンツの一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
  const siblingCandidates = [...contents]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((content) => ({
      id: content.id,
      label: content.title,
      isPublished: content.is_published,
      parentId: content.week_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ新規作成"
        breadcrumbs={[{ label: "コンテンツ管理", href: "/manage/contents" }, { label: "新規作成" }]}
      />
      <ContentForm
        themes={filterOptions.themes}
        phases={filterOptions.phases}
        weeks={filterOptions.weeks}
        initialWeekSelection={{
          themeId: firstParam(params.theme),
          phaseId: firstParam(params.phase),
          weekId: firstParam(params.week),
        }}
        siblingCandidates={siblingCandidates}
        mode="create"
      />
    </div>
  );
}
