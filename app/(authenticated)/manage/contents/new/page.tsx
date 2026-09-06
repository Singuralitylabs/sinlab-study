import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { compareGroupLevel, sortWeeksByHierarchy } from "@/app/lib/content-grouping";
import { fetchAllContents, fetchAllWeeks } from "@/app/services/api/admin-server";
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
  const [{ data: weeks }, { data: contents }] = await Promise.all([
    fetchAllWeeks(),
    fetchAllContents(),
  ]);
  const sortedWeeks = weeks ? sortWeeksByHierarchy(weeks) : [];
  const filterOptions = deriveWeekSelectOptions(sortedWeeks);

  // 挿入位置ピッカーの兄弟候補（週選択後にフォーム側で week_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblingCandidates = [...(contents ?? [])]
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
