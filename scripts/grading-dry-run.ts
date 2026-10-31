/**
 * Must stay write-free and dev-only: it reads every learner's submissions with the service role
 * key and bills Gemini tokens, so pointing it at production would leak data and cost money.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { USER_STATUS } from "@/app/constants/user";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import { parseGradingRubric } from "@/app/lib/grading-schema";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";
import {
  generateReview,
  ReviewGenerationError,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import type { Database } from "@/app/types/lib/database.types";
import { type DryRunSample, formatSummary, summarizeByContent } from "./grading-dry-run-stats";

export function readArgs(argv: string[]) {
  const contentIds: number[] = [];
  let limit = 5;
  let repeat = 1;
  let confirmed = false;
  let model: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--confirm-dev") {
      confirmed = true;
    } else if (arg === "--content-id") {
      contentIds.push(Number(argv[++i]));
    } else if (arg === "--limit") {
      limit = Number(argv[++i]);
    } else if (arg === "--repeat") {
      repeat = Number(argv[++i]);
    } else if (arg === "--model") {
      // Pin one model so a fallback does not mix graders while comparing score tendency.
      const next = argv[++i];
      if (!next) {
        throw new Error("--model requires a model id");
      }
      model = next;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const valid = (n: number) => Number.isInteger(n) && n > 0;
  if (![...contentIds, limit, repeat].every(valid)) {
    throw new Error("--content-id / --limit / --repeat must be positive integers");
  }
  return { contentIds, limit, repeat, confirmed, model };
}

async function main() {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const { contentIds, limit, repeat, confirmed, model } = readArgs(process.argv.slice(2));
  if (!confirmed) {
    throw new Error("Pass --confirm-dev to confirm this targets a dev project, not production.");
  }
  if (model) {
    console.log(`Pinned model: ${model}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = resolveGeminiApiKey(USER_STATUS.ACTIVE);
  if (!url || !serviceRoleKey || !apiKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY are required"
    );
  }

  const supabase = createClient<Database>(url, serviceRoleKey);
  let contentQuery = supabase
    .from("learning_contents")
    .select(
      "id, exercise_instructions, reference_answer, grading_rubric, code_language, starter_files"
    )
    .eq("content_type", "exercise")
    .eq("is_deleted", false)
    .not("grading_rubric", "is", null);
  if (contentIds.length > 0) {
    contentQuery = contentQuery.in("id", contentIds);
  }
  const { data: contents, error: contentError } = await contentQuery;
  if (contentError) {
    throw new Error(`Failed to load contents: ${contentError.message}`);
  }

  const samples: DryRunSample[] = [];
  for (const content of contents ?? []) {
    const rubric = parseGradingRubric(content.grading_rubric);
    if (!rubric || !content.exercise_instructions) {
      console.warn(`content ${content.id}: skipped (no usable rubric or instructions)`);
      continue;
    }

    const { data: submissions, error: submissionError } = await supabase
      .from("submissions")
      .select("id, code_content, code_files")
      .eq("content_id", content.id)
      .eq("submission_type", "code")
      .order("submitted_at", { ascending: false })
      .limit(limit);
    if (submissionError) {
      throw new Error(`Failed to load submissions: ${submissionError.message}`);
    }

    for (const submission of submissions ?? []) {
      const files = getSubmissionCodeFiles(submission);
      if (files.length === 0) {
        continue;
      }
      for (let run = 1; run <= repeat; run++) {
        try {
          const result = await generateReview({
            exerciseInstructions: content.exercise_instructions,
            submission: { type: "code", files: withFallbackLanguage(files, content.code_language) },
            referenceAnswer: content.reference_answer,
            gradingRubric: rubric,
            starterFiles: parseStarterFiles(content.starter_files),
            apiKey,
            modelName: model,
          });
          samples.push({
            contentId: content.id,
            score: result.overallScore,
            hasUnmet: result.reviewJson.requirements.some((r) => r.status === "unmet"),
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            thoughtsTokens: result.thoughtsTokens,
          });
          console.log(
            `content ${content.id} submission ${submission.id} run ${run}: score ${result.overallScore} model ${result.modelUsed}`
          );
        } catch (error) {
          // Failed and regenerated calls are still billed. Omit them and the cost average is low.
          if (error instanceof ReviewGenerationError) {
            samples.push({
              contentId: content.id,
              score: null,
              hasUnmet: false,
              promptTokens: error.usage.promptTokens,
              completionTokens: error.usage.completionTokens,
              thoughtsTokens: error.usage.thoughtsTokens,
            });
          }
          console.warn(
            `content ${content.id} submission ${submission.id} run ${run}: failed (${
              error instanceof Error ? error.message : "unknown"
            })`
          );
        }
      }
    }
  }

  console.log("\n=== Summary (nothing was written to the database) ===");
  for (const summary of summarizeByContent(samples)) {
    console.log(formatSummary(summary));
  }
  if (samples.length === 0) {
    console.log("No submissions were graded.");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
