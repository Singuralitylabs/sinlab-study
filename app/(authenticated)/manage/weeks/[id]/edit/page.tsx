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

  // 兄弟候補（全週、自分自身を含む）の取得失敗を「兄弟なし」として扱うと、現在位置が
  // 不明なまま挿入位置ピッカーの既定値が先頭になってしまう。PUT時（updateWeek内の再採番）
  // にDBが復旧していると、意図せず既存週全件が後ろへ再採番されるため、
  // 取得失敗時はフォームを表示しない（new/page.tsxと同じ方針）。
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

  // 挿入位置ピッカーの兄弟候補（フェーズ選択後にフォーム側で phase_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
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
