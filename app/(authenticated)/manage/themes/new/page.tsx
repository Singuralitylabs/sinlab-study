import { PageTitle } from "@/app/components/PageTitle";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { fetchAllThemes } from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeForm } from "../ThemeForm";

export default async function NewThemePage() {
  const { data: themes, error } = await fetchAllThemes();

  // Treating a failed fetch as "no siblings" (empty array) would show an empty picker although
  // themes exist, and submit with the default head insert. If the DB recovers by POST time
  // (renumbering inside createTheme), themes the user never saw would be renumbered backward
  // unintentionally, so don't show the form on failure.
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

  // Themes have no parent, so all themes are always the siblings. Sort with the same comparator as
  // content-grouping.ts (display_order ascending, id tiebreak).
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
