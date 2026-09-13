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

  // 兄弟候補（週一覧）の取得失敗を「兄弟なし」として扱うと、選択したフェーズ配下に
  // 実際には既存週があるのに空一覧を表示してしまい、既定の先頭挿入のまま送信できてしまう。
  // POST時（createWeek内の再採番）にDBが復旧していると、既存週全件が意図せず
  // 後ろへ再採番されるため、取得失敗時はフォームを表示しない。
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

  // 挿入位置ピッカーの兄弟候補（フェーズ選択後にフォーム側で phase_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
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
