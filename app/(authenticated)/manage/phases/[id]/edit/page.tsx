import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllPhases, fetchAllThemes, fetchPhaseById } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhaseForm } from "../../PhaseForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPhasePage({ params }: PageProps) {
  const { id } = await params;
  const phaseId = Number.parseInt(id, 10);

  if (Number.isNaN(phaseId)) {
    notFound();
  }

  const [{ data: phase }, { data: themes }, { data: phases, error: phasesError }] =
    await Promise.all([fetchPhaseById(phaseId), fetchAllThemes(), fetchAllPhases()]);

  if (!phase) {
    notFound();
  }

  // 兄弟候補（全フェーズ、自分自身を含む）の取得失敗を「兄弟なし」として扱うと、現在位置が
  // 不明なまま挿入位置ピッカーの既定値が先頭になってしまう。PUT時（updatePhase内の再採番）
  // にDBが復旧していると、意図せず既存フェーズ全件が後ろへ再採番されるため、
  // 取得失敗時はフォームを表示しない（new/page.tsxと同じ方針）。
  if (phasesError || !phases) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="フェーズ編集"
          breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: phase.name }]}
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
    .map((p) => ({
      id: p.id,
      label: p.name,
      isPublished: p.is_published,
      parentId: p.theme_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="フェーズ編集"
        breadcrumbs={[{ label: "フェーズ管理", href: "/manage/phases" }, { label: phase.name }]}
      />
      <PhaseForm
        themes={themes ?? []}
        initialData={phase}
        siblingCandidates={siblingCandidates}
        mode="edit"
      />
    </div>
  );
}
