type BulkImportRow = {
  theme_name: string;
  phase_name: string;
  week_name: string;
  title: string;
  content_type: string;
  video_url?: string;
  text_content?: string;
  exercise_instructions?: string;
  reference_answer?: string;
  hint?: string;
  allowed_submission_types?: string;
  code_language?: string;
  is_published?: boolean;
  display_order?: number;
  theme_description?: string;
  phase_description?: string;
  week_description?: string;
};

type BulkImportError = {
  rowNumber: number;
  message: string;
};

type BulkImportParseResult = {
  rows: BulkImportRow[];
  errors: BulkImportError[];
};

const VALID_CONTENT_TYPES = ["video", "text", "exercise"] as const;
const VALID_ALLOWED_SUBMISSION_TYPES = ["code", "url", "both"] as const;
const VALID_CODE_LANGUAGES = ["javascript", "typescript", "html", "css"] as const;

function parseCsvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseCsvNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

/**
 * CSVファイルのバイナリをテキストへデコードする。
 * UTF-8として厳密デコードを試み、不正なバイト列（Shift-JIS等）であれば
 * Shift-JISとしてデコードし直すことで、文字コードを自動判定する。
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

export function parseBulkImportCsv(csvText: string): BulkImportParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line, _index) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    return {
      theme_name: row.theme_name ?? "",
      phase_name: row.phase_name ?? "",
      week_name: row.week_name ?? "",
      title: row.title ?? "",
      content_type: row.content_type ?? "",
      video_url: row.video_url || undefined,
      text_content: row.text_content || undefined,
      exercise_instructions: row.exercise_instructions || undefined,
      reference_answer: row.reference_answer || undefined,
      hint: row.hint || undefined,
      allowed_submission_types: row.allowed_submission_types || undefined,
      code_language: row.code_language || undefined,
      is_published: parseCsvBoolean(row.is_published),
      display_order: parseCsvNumber(row.display_order),
      theme_description: row.theme_description || undefined,
      phase_description: row.phase_description || undefined,
      week_description: row.week_description || undefined,
    } satisfies BulkImportRow;
  });

  return { rows, errors: [] };
}

export function validateBulkImportRows(rows: BulkImportRow[]): {
  validRows: BulkImportRow[];
  errors: BulkImportError[];
} {
  const errors: BulkImportError[] = [];
  const validRows: BulkImportRow[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (!row.theme_name?.trim()) {
      errors.push({ rowNumber, message: "テーマ名が未入力です" });
      return;
    }
    if (!row.phase_name?.trim()) {
      errors.push({ rowNumber, message: "フェーズ名が未入力です" });
      return;
    }
    if (!row.week_name?.trim()) {
      errors.push({ rowNumber, message: "週名が未入力です" });
      return;
    }
    if (!row.title?.trim()) {
      errors.push({ rowNumber, message: "タイトルが未入力です" });
      return;
    }
    if (!VALID_CONTENT_TYPES.includes(row.content_type as (typeof VALID_CONTENT_TYPES)[number])) {
      errors.push({
        rowNumber,
        message: "content_type は video / text / exercise のいずれかで入力してください",
      });
      return;
    }

    if (row.content_type === "video" && !row.video_url?.trim()) {
      errors.push({ rowNumber, message: "video の行では video_url が必須です" });
      return;
    }
    if (row.content_type === "text" && !row.text_content?.trim()) {
      errors.push({ rowNumber, message: "text の行では text_content が必須です" });
      return;
    }
    if (row.content_type === "exercise" && !row.exercise_instructions?.trim()) {
      errors.push({ rowNumber, message: "exercise の行では exercise_instructions が必須です" });
      return;
    }

    if (
      row.allowed_submission_types &&
      !VALID_ALLOWED_SUBMISSION_TYPES.includes(
        row.allowed_submission_types as (typeof VALID_ALLOWED_SUBMISSION_TYPES)[number]
      )
    ) {
      errors.push({
        rowNumber,
        message: "allowed_submission_types は code / url / both のいずれかで入力してください",
      });
      return;
    }

    if (
      row.code_language &&
      !VALID_CODE_LANGUAGES.includes(row.code_language as (typeof VALID_CODE_LANGUAGES)[number])
    ) {
      errors.push({
        rowNumber,
        message:
          "code_language は javascript / typescript / html / css のいずれかで入力してください",
      });
      return;
    }

    validRows.push(row);
  });

  return { validRows, errors };
}

export type { BulkImportError, BulkImportRow };
