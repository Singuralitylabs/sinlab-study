import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllThemes } from "@/app/services/api/admin-server";
import { ThemeForm } from "../ThemeForm";

export default async function NewThemePage() {
  const { data: themes } = await fetchAllThemes();

  // テーマは親を持たないため常に全テーマが挿入位置ピッカーの兄弟一覧になる。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblings = [...(themes ?? [])]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((theme) => ({ id: theme.id, label: theme.name, isPublished: theme.is_published }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="テーマ新規作成"
        breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: "新規作成" }]}
      />
      <ThemeForm siblings={siblings} mode="create" />
    </div>
  );
}
