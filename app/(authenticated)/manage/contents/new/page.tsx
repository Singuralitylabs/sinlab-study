import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { fetchAllWeeks } from "@/app/services/api/admin-server";
import { ContentForm } from "../ContentForm";

interface NewContentPageProps {
  // App RouterのsearchParamsは同名クエリの重複時に string[] にもなりうる
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** 同名クエリが重複して string[] になった場合は先頭の値のみを使う */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function NewContentPage({ searchParams }: NewContentPageProps) {
  const params = await searchParams;
  const { data: weeks } = await fetchAllWeeks();
  const filterOptions = deriveWeekSelectOptions(weeks ?? []);

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
        mode="create"
      />
    </div>
  );
}
