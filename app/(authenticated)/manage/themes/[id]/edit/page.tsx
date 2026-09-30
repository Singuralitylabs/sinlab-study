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

  // Treating a failed sibling fetch (all themes, including itself) as "no siblings" would leave the
  // current position unknown and default the insert picker to the head. If the DB recovers by PUT
  // time (renumbering inside updateTheme), all existing themes would be renumbered backward
  // unintentionally, so don't show the form on failure (same policy as new/page.tsx).
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

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
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
