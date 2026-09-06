import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllThemes } from "@/app/services/api/admin-server";
import { PhaseForm } from "../PhaseForm";

export default async function NewPhasePage() {
  const [{ data: themes }, { data: phases }] = await Promise.all([
    fetchAllThemes(),
    fetchAllPhases(),
  ]);

  // 挿入位置ピッカーの兄弟候補（テーマ選択後にフォーム側で theme_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblingCandidates = [...(phases ?? [])]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((phase) => ({
      id: phase.id,
      label: phase.name,
      isPublished: phase.is_published,
      parentId: phase.theme_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ新規作成"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: "新規作成" }]}
      />
      <PhaseForm themes={themes ?? []} siblingCandidates={siblingCandidates} mode="create" />
    </div>
  );
}
