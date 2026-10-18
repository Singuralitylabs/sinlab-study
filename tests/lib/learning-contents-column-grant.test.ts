import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEARNING_CONTENT_DETAIL_COLUMN_LIST,
  LEARNING_CONTENT_LIST_COLUMNS,
} from "@/app/services/api/learning-server";

const learningServerPath = join(process.cwd(), "app/services/api/learning-server.ts");

const migrationsDir = join(process.cwd(), "supabase/migrations");
const typesPath = join(process.cwd(), "app/types/lib/database.types.ts");

/** Columns of the newest `GRANT SELECT (...) ON TABLE public.learning_contents`. */
function latestLearnerSelectColumns(): string[] {
  const pattern = /GRANT SELECT \(\s*([^;]*?)\s*\)\s*ON TABLE public\.learning_contents/g;
  let latest: string | null = null;
  for (const file of readdirSync(migrationsDir).sort()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const match of sql.matchAll(pattern)) {
      latest = match[1];
    }
  }
  if (latest === null) {
    throw new Error("learning_contents の GRANT SELECT が見つかりません");
  }
  return latest
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}

/** Own columns of a PostgREST select list, dropping the first embed (`phase:learning_phases(...)`). */
function ownColumns(selectList: string): string[] {
  const head = selectList.split(/,\s*\w+:/)[0] ?? selectList;
  return head
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}

function learningContentRowColumns(): string[] {
  const source = readFileSync(typesPath, "utf8");
  const match = source.match(/learning_contents:\s*\{[\s\S]*?Row:\s*\{([\s\S]*?)\n\s*\};/);
  if (!match) {
    throw new Error("learning_contents の Row が見つかりません");
  }
  return [...match[1].matchAll(/^\s+(\w+):/gm)].map((found) => found[1]);
}

describe("learning_contents の受講生向け列権限", () => {
  const granted = latestLearnerSelectColumns();
  const rowColumns = learningContentRowColumns();

  const hidden = ["grading_rubric", "reference_answer"];

  it("付与列は grading_rubric と reference_answer を除く全列と一致する", () => {
    expect(granted.sort()).toEqual(rowColumns.filter((column) => !hidden.includes(column)).sort());
    for (const column of hidden) {
      expect(granted).not.toContain(column);
    }
  });

  it("受講生の select は付与列の部分集合で、採点基準と模範回答を含まない", () => {
    for (const column of ownColumns(LEARNING_CONTENT_DETAIL_COLUMN_LIST)) {
      expect(granted).toContain(column);
    }
    for (const column of ownColumns(LEARNING_CONTENT_LIST_COLUMNS)) {
      expect(granted).toContain(column);
    }
    for (const column of hidden) {
      expect(LEARNING_CONTENT_DETAIL_COLUMN_LIST).not.toContain(column);
      expect(LEARNING_CONTENT_LIST_COLUMNS).not.toContain(column);
    }
  });

  it("submission_file_slots は受講生に付与し、service_role のサマリー列には含めない", () => {
    expect(granted).toContain("submission_file_slots");
    expect(ownColumns(LEARNING_CONTENT_DETAIL_COLUMN_LIST)).toContain("submission_file_slots");
    const source = readFileSync(learningServerPath, "utf8");
    const summary = source.match(/CONTENT_VISIBILITY_SUMMARY_COLUMNS =\s*\n?\s*"([^"]+)"/);
    expect(summary?.[1]).toBeTruthy();
    expect(summary?.[1]).not.toContain("submission_file_slots");
  });

  it("show_preview と show_console は受講生に付与し、service_role のサマリー列には含めない", () => {
    expect(granted).toContain("show_preview");
    expect(granted).toContain("show_console");
    expect(ownColumns(LEARNING_CONTENT_DETAIL_COLUMN_LIST)).toEqual(
      expect.arrayContaining(["show_preview", "show_console"])
    );
    const source = readFileSync(learningServerPath, "utf8");
    const summary = source.match(/CONTENT_VISIBILITY_SUMMARY_COLUMNS =\s*\n?\s*"([^"]+)"/);
    expect(summary?.[1]).not.toContain("show_preview");
    expect(summary?.[1]).not.toContain("show_console");
  });
});
