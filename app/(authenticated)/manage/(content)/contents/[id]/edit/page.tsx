import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { derivePhaseSelectOptions } from "@/app/lib/content-filtering";
import { compareGroupLevel, sortPhasesByHierarchy } from "@/app/lib/content-grouping";
import { manageContentsReturnPath } from "@/app/lib/manage-contents-paths";
import {
  fetchAllPhases,
  fetchContentByIdForAdmin,
  fetchContentSiblingCandidates,
  fetchQuizQuestionsForAdmin,
} from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentForm } from "../../ContentForm";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditContentPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const returnPath = manageContentsReturnPath(firstParam(query.from));
  const contentId = Number.parseInt(id, 10);

  if (Number.isNaN(contentId)) {
    notFound();
  }

  const [{ data: content }, { data: phases }, { data: contents, error: contentsError }, quizFetch] =
    await Promise.all([
      fetchContentByIdForAdmin(contentId),
      fetchAllPhases(),
      fetchContentSiblingCandidates(),
      fetchQuizQuestionsForAdmin(contentId),
    ]);

  if (!content) {
    notFound();
  }

  // Stored questions are loaded for every type: a quiz switched to another type keeps its rows,
  // and switching it back in this form must start from them, or saving would overwrite them with
  // an empty question. On a failed fetch a quiz is not editable at all; other types stay editable
  // but cannot be switched to quiz (quizQuestionsUnavailable).
  const quizError = content.content_type === "quiz" ? quizFetch.error : null;
  const quizQuestions = quizFetch.data ?? [];

  const sortedPhases = phases ? sortPhasesByHierarchy(phases) : [];
  const filterOptions = derivePhaseSelectOptions(sortedPhases);

  // Treating a failed sibling fetch (all contents, including itself) as "no siblings" would leave
  // the current position unknown and default the insert picker to the head. If the DB recovers by
  // PUT time (renumbering inside updateContent), all existing contents would be renumbered backward
  // unintentionally, so don't show the form on failure (same policy as new/page.tsx).
  // A failed question fetch would open the editor empty, and saving would wipe the stored
  // questions (the save replaces them all), so don't show the form.
  if (contentsError || !contents || quizError) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="コンテンツ編集"
          breadcrumbs={[{ label: "コンテンツ管理", href: returnPath }, { label: content.title }]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            {quizError
              ? "クイズの設問の取得に失敗しました。時間をおいて再度お試しください。"
              : "既存コンテンツの一覧取得に失敗しました。時間をおいて再度お試しください。"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
  const siblingCandidates = [...contents]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((c) => ({
      id: c.id,
      label: c.title,
      isPublished: c.is_published,
      parentId: c.phase_id,
    }));

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ編集"
        breadcrumbs={[{ label: "コンテンツ管理", href: returnPath }, { label: content.title }]}
      />
      <ContentForm
        themes={filterOptions.themes}
        phases={filterOptions.phases}
        initialData={content}
        initialQuizQuestions={quizQuestions}
        quizQuestionsUnavailable={Boolean(quizFetch.error)}
        siblingCandidates={siblingCandidates}
        mode="edit"
        returnPath={returnPath}
      />
    </div>
  );
}
