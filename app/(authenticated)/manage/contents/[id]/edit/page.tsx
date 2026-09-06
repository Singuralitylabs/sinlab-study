import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { compareGroupLevel, sortWeeksByHierarchy } from "@/app/lib/content-grouping";
import {
  fetchAllContents,
  fetchAllWeeks,
  fetchContentByIdForAdmin,
} from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentForm } from "../../ContentForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContentPage({ params }: PageProps) {
  const { id } = await params;
  const contentId = Number.parseInt(id, 10);

  if (Number.isNaN(contentId)) {
    notFound();
  }

  const [{ data: content }, { data: weeks }, { data: contents, error: contentsError }] =
    await Promise.all([fetchContentByIdForAdmin(contentId), fetchAllWeeks(), fetchAllContents()]);

  if (!content) {
    notFound();
  }

  const sortedWeeks = weeks ? sortWeeksByHierarchy(weeks) : [];
  const filterOptions = deriveWeekSelectOptions(sortedWeeks);

  // 兄弟候補（全コンテンツ、自分自身を含む）の取得失敗を「兄弟なし」として扱うと、現在位置が
  // 不明なまま挿入位置ピッカーの既定値が先頭になってしまう。PUT時（updateContent内の再採番）
  // にDBが復旧していると、意図せず既存コンテンツ全件が後ろへ再採番されるため、
  // 取得失敗時はフォームを表示しない（new/page.tsxと同じ方針）。
  if (contentsError || !contents) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="コンテンツ編集"
          breadcrumbs={[
            { label: "コンテンツ管理", href: "/manage/contents" },
            { label: content.title },
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

  // 挿入位置ピッカーの兄弟候補（週選択後にフォーム側で week_id により絞り込む）。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblingCandidates = [...contents]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((c) => ({
      id: c.id,
      label: c.title,
      isPublished: c.is_published,
      parentId: c.week_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ編集"
        breadcrumbs={[
          { label: "コンテンツ管理", href: "/manage/contents" },
          { label: content.title },
        ]}
      />
      <ContentForm
        themes={filterOptions.themes}
        phases={filterOptions.phases}
        weeks={filterOptions.weeks}
        initialData={content}
        siblingCandidates={siblingCandidates}
        mode="edit"
      />
    </div>
  );
}
