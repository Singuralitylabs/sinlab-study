import { type NextRequest, NextResponse } from "next/server";
import { ANALYTICS_EVENT } from "@/app/constants/analytics";
import { runAfterResponse } from "@/app/lib/after-response";
import { shouldTrackFirstSubmission } from "@/app/lib/analytics-funnel";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import {
  blocksUneditedStarter,
  EMPTY_SUBMISSION_CODE_ERROR,
  filesMatchSubmissionFileSlots,
  layoutOmitsEmptyFiles,
  normalizeCodeLanguage,
  resolveSubmissionFileSlots,
  toStoredSubmissionCode,
} from "@/app/lib/submission-file-slots";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import { issueCertificateIfEligible } from "@/app/services/api/certificates-server";
import { fetchVisibleContentForSubmission } from "@/app/services/api/learning-server";
import { SubmissionCreateSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";
import type { CodeFile } from "@/app/types";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, SubmissionCreateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, submissionType, codeContent, codeFiles, url } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId, userStatus, userRole } = guard.auth;

    const supabase = await createServerSupabaseClient();

    // Visibility + file layout in one round-trip (403 if contentId isn't visible: trial-closed,
    // unpublished and nonexistent IDs all give 0 rows via RLS).
    const content = await fetchVisibleContentForSubmission(supabase, contentId);
    if (!content) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // Exactly one of code_content / code_files is set. Default single file → code_content, two or
    // more → code_files. A single file MAY still use code_files when the name is not the exercise
    // default (code_content cannot store it). Slot checks run before that split so an empty file
    // cannot be dropped on the way in.
    let storedCodeContent: string | null = null;
    let storedCodeFiles: CodeFile[] | null = null;
    let storedUrl: string | null = null;

    if (submissionType === "code") {
      const codeLanguage = normalizeCodeLanguage(content.code_language);
      const slots = resolveSubmissionFileSlots({
        submissionFileSlots: content.submission_file_slots,
        starterFiles: parseStarterFiles(content.starter_files),
        codeLanguage,
      });
      // An empty codeFiles array used to fall through to codeContent. Treating [] as the file
      // list drops that legacy body and 400s even for the default single-file exercise.
      const rawFiles =
        Array.isArray(codeFiles) && codeFiles.length > 0
          ? codeFiles
          : typeof codeContent === "string" && codeContent.trim().length > 0
            ? [{ filename: "", language: "", content: codeContent }]
            : [];
      if (rawFiles.length === 0) {
        return NextResponse.json({ error: EMPTY_SUBMISSION_CODE_ERROR }, { status: 400 });
      }
      const omitEmptyFiles = layoutOmitsEmptyFiles(content.submission_file_slots, slots.length);
      const matched = filesMatchSubmissionFileSlots(rawFiles, slots, codeLanguage, {
        omitEmptyFiles,
      });
      if (!matched.ok) {
        return NextResponse.json({ error: matched.error }, { status: 400 });
      }
      const starterFiles = parseStarterFiles(content.starter_files);
      // Compare before code_content drops the filename. A blanked starter file is already gone
      // from matched.files, so the slot count has to stay the pre-omit length.
      if (
        blocksUneditedStarter({
          files: matched.files,
          submissionFileSlots: content.submission_file_slots,
          starterFiles,
          fileCount: slots.length,
        })
      ) {
        return NextResponse.json({ error: "初期コードから変更してください" }, { status: 400 });
      }
      const stored = toStoredSubmissionCode(matched.files, codeLanguage);
      storedCodeContent = stored.codeContent;
      storedCodeFiles = stored.codeFiles;
    } else {
      const trimmedUrl = typeof url === "string" ? url.trim() : "";
      if (trimmedUrl.length === 0) {
        return NextResponse.json({ error: "URLが入力されていません" }, { status: 400 });
      }
      storedUrl = trimmedUrl;
    }

    // Count before insert so the new row is not treated as a pre-existing submission.
    const { count: existingSubmissionCount, error: countError } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) {
      console.error("提出件数の取得エラー:", countError.message);
    }

    const { data: submission, error: insertError } = await supabase
      .from("submissions")
      .insert({
        user_id: userId,
        content_id: contentId,
        submission_type: submissionType,
        code_content: storedCodeContent,
        code_files: storedCodeFiles,
        url: storedUrl,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("提出作成エラー:", insertError);
      return NextResponse.json({ error: "提出の作成に失敗しました" }, { status: 500 });
    }

    if (!countError && shouldTrackFirstSubmission(existingSubmissionCount ?? 0) && userStatus) {
      trackServerEvent(ANALYTICS_EVENT.FIRST_SUBMISSION, { status: userStatus });
    }

    // Theme may already be 100% with only exercise gaps left (URL-only / no-rubric, or AI review
    // never ran). Progress and AI-review hooks miss that path; defer so issuance stays off the
    // critical path. Failures here must not change the submission response.
    await runAfterResponse(() =>
      issueCertificateIfEligible({ userId, userStatus, userRole, contentId })
    );

    return NextResponse.json({ success: true, submission });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
