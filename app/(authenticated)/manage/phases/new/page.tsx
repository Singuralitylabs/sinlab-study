import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllThemes } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhaseForm } from "../PhaseForm";

export default async function NewPhasePage() {
  const [{ data: themes }, { data: phases, error: phasesError }] = await Promise.all([
    fetchAllThemes(),
    fetchAllPhases(),
  ]);

  // 兄弟候補（フェーズ一覧）の取得失敗を「兄弟なし」として扱うと、選択したテーマ配下に
  // 実際には既存フェーズがあるのに空一覧を表示してしまい、既定の先頭挿入のまま送信できて
  // しまう。POST時（createPhase内の再採番）にDBが復旧していると、既存フェーズ全件が
  // 意図せず後ろへ再採番されるため、取得失敗時はフォームを表示しない。
  if (phasesError || !phases) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="フェーズ新規作成"
          breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: "新規作成" }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存フェーズの一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 挿入位置ピッカーの兄弟候補（テーマ選択後にフォーム側で theme_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblingCandidates = [...phases]
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
