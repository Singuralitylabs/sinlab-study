import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllWeeks } from "@/app/services/api/admin-server";
import { WeekForm } from "../WeekForm";

export default async function NewWeekPage() {
  const [{ data: phases }, { data: weeks }] = await Promise.all([
    fetchAllPhases(),
    fetchAllWeeks(),
  ]);

  // 挿入位置ピッカーの兄弟候補（フェーズ選択後にフォーム側で phase_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblingCandidates = [...(weeks ?? [])]
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
