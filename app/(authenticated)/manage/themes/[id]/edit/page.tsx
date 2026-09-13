import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllThemes, fetchThemeById } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeForm } from "../../ThemeForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditThemePage({ params }: PageProps) {
  const { id } = await params;
  const themeId = Number.parseInt(id, 10);

  if (Number.isNaN(themeId)) {
    notFound();
  }

  const [{ data: theme }, { data: themes, error: themesError }] = await Promise.all([
    fetchThemeById(themeId),
    fetchAllThemes(),
  ]);

  if (!theme) {
    notFound();
  }

  // 兄弟一覧（全テーマ、自分自身を含む）の取得失敗を「兄弟なし」として扱うと、現在位置が
  // 不明なまま挿入位置ピッカーの既定値が先頭になってしまう。PUT時（updateTheme内の再採番）
  // にDBが復旧していると、意図せず既存テーマ全件が後ろへ再採番されるため、
  // 取得失敗時はフォームを表示しない（new/page.tsxと同じ方針）。
  if (themesError || !themes) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="テーマ編集"
          breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: theme.name }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存テーマの一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblings = [...themes]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((t) => ({ id: t.id, label: t.name, isPublished: t.is_published }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="テーマ編集"
        breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: theme.name }]}
      />
      <ThemeForm initialData={theme} siblings={siblings} mode="edit" />
    </div>
  );
}
