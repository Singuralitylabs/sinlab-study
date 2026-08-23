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

/**
 * 1回のインポートで受け付けるCSVの最大行数（ヘッダー行を除く）。
 * 現状の実装は1行ごとに複数回Supabaseへ通信するため、行数が多いと
 * Vercel Hobbyプランの関数タイムアウト（10秒）に抵触し、ロールバックが
 * 実行されないまま処理が打ち切られるおそれがある。通信をバッチ化する
 * までの暫定的な安全策として保守的な値にしている。
 */
export const MAX_BULK_IMPORT_ROWS = 20;

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

/**
 * CSV全体を1回で走査してレコード（行×フィールド）に分解する。
 * text_content 等は複数行のMarkdownを想定しているため、改行で先に行分割せず、
 * 引用符の中かどうかを見ながら走査することで、引用符内の改行をフィールドの
 * 値としてそのまま保持する（=改行を含む本文が途中で分裂しない）。
 * 完全な空行（フィールドが1つだけで空文字）はレコードから除外する。
 */
function parseCsvRecords(csvText: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field.trim());
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < csvText.length) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      // 引用符内の CRLF は LF に正規化して保持する
      if (char === "\r" && csvText[i + 1] === "\n") {
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      endField();
      i += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i += 1;
      }
      endRecord();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || record.length > 0) {
    endRecord();
  }

  return records.filter((r) => !(r.length === 1 && r[0] === ""));
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
  const records = parseCsvRecords(csvText);

  if (records.length === 0) {
    return { rows: [], errors: [] };
  }

  const headers = records[0];
  const rows = records.slice(1).map((values) => {
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
