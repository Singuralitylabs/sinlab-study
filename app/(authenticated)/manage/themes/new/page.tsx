import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllThemes } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeForm } from "../ThemeForm";

export default async function NewThemePage() {
  const { data: themes, error } = await fetchAllThemes();

  // 取得失敗を「兄弟なし」（空配列）として扱うと、既存テーマが実際には存在するのに
  // 挿入位置ピッカーが空一覧を表示してしまい、既定の先頭挿入のまま送信できてしまう。
  // POST時（createTheme内の再採番）にDBが復旧していると、利用者が把握していない
  // 既存テーマ全件が意図せず後ろへ再採番されるため、取得失敗時はフォームを表示しない。
  if (error || !themes) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="テーマ新規作成"
          breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: "新規作成" }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            既存テーマの一覧取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // テーマは親を持たないため常に全テーマが挿入位置ピッカーの兄弟一覧になる。
  // content-grouping.ts の階層順ソートと同じ比較関数（display_order昇順・idタイブレーク）で揃える
  const siblings = [...themes]
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
