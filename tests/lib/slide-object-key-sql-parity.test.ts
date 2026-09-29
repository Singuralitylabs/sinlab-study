import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isBlankSlidePdfUrl, toSlideObjectKey } from "@/app/lib/slide-object-key";
import { ContentUpdateSchema } from "@/app/services/api/schemas";

/**
 * Normalization expression of 20260917011152_validate_slide_pdf_url_object_keys.sql. The tests
 * below ensure the
 * UPDATE, the validation DO block and this constant all match.
 */
const SLIDE_PDF_URL_SQL_NORMALIZE_EXPR = `regexp_replace(
      btrim(pdf_url, E' \\t\\r\\n'),
      '^(https?://[^/]+)?/storage/v1/object/public/slides/',
      ''
    )`;

/**
 * Invalid-value WHERE clause of the same migration; the tests ensure it matches this constant, so
 * changing
 * only one side fails (#217).
 */
const SLIDE_PDF_URL_SQL_INVALID_PREDICATE = `n.key = ''
    OR n.key ~ '^/'
    OR n.key ~* '^[a-z][a-z0-9+.-]*:'
    OR EXISTS (
      SELECT 1
      FROM unnest(string_to_array(n.key, '/')) AS segment
      WHERE segment IN ('', '.', '..')
    )`;

const MIGRATION_FILE = resolve(
  __dirname,
  "../../supabase/migrations/20260917011152_validate_slide_pdf_url_object_keys.sql"
);

/**
 * Same normalization as the migration (btrim equivalent, then strip the legacy public URL prefix).
 */
const LEGACY_PUBLIC_URL_PREFIX = /^(?:https?:\/\/[^/]+)?\/storage\/v1\/object\/public\/slides\//;

function normalizeLikeMigration(pdfUrl: string): string {
  return pdfUrl.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").replace(LEGACY_PUBLIC_URL_PREFIX, "");
}

/**
 * Evaluates the SQL rejection condition in JS (regex and segment split mirror the SQL constant),
 * reproducing
 * the SQL rules without using toSlideObjectKey.
 */
function isRejectedBySqlPredicate(pdfUrl: string): boolean {
  const key = normalizeLikeMigration(pdfUrl);
  if (key === "") {
    return true;
  }
  if (/^\//.test(key)) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(key)) {
    return true;
  }
  return key.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

const PARITY_CASES: Array<[string, string]> = [
  ["正常なキー", "gas/slide-01.pdf"],
  ["応用編の正常なキー", "gas-advanced/slide-100.pdf"],
  ["タイムスタンプ形式のキー", "1700000000000_intro.pdf"],
  ["旧形式の相対パス（正規化後は有効）", "/storage/v1/object/public/slides/gas/slide-01.pdf"],
  [
    "旧形式の完全URL（正規化後は有効）",
    "https://project.supabase.co/storage/v1/object/public/slides/gas/slide-01.pdf",
  ],
  ["前後空白付きの正常キー", "  gas/slide-01.pdf  "],
  ["空文字", ""],
  ["空白のみ", "   "],
  ["タブ・CR・LF のみ", "\t\r\n"],
  ["空セグメント", "gas//slide-01.pdf"],
  ["親ディレクトリ参照", "gas/../slide-01.pdf"],
  ["カレントセグメント", "gas/./slide-01.pdf"],
  ["外部URL", "https://example.com/a.pdf"],
  ["スキーム付き data", "data:application/pdf;base64,AAAA"],
  ["スラッシュ始まり", "/gas/slide-01.pdf"],
  ["他バケットの公開URL", "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png"],
  ["接頭辞だけで空のキー", "/storage/v1/object/public/slides/"],
  ["末尾スラッシュ（空セグメント）", "gas/slide-01.pdf/"],
  ["セグメントがドットのみ", "."],
  ["セグメントがドットドットのみ", ".."],
];

describe("slide pdf_url SQL 検証と toSlideObjectKey の一致 (#217)", () => {
  it("マイグレーションに正規化式・不正判定定数がそのまま含まれる", () => {
    const migrationSql = readFileSync(MIGRATION_FILE, "utf8");
    expect(migrationSql).toContain(SLIDE_PDF_URL_SQL_NORMALIZE_EXPR);
    expect(migrationSql).toContain(SLIDE_PDF_URL_SQL_INVALID_PREDICATE);
    // The UPDATE and the validation DO must use the same expression (guards against changing only
    // one).
    const normalizeOccurrences = migrationSql.split(SLIDE_PDF_URL_SQL_NORMALIZE_EXPR).length - 1;
    expect(normalizeOccurrences).toBe(2);
  });

  it.each(PARITY_CASES)("同じ入力で JS と SQL 規則が一致する（%s）", (_label, value) => {
    const jsRejects = toSlideObjectKey(value) === null;
    const sqlRejects = isRejectedBySqlPredicate(value);
    expect(sqlRejects).toBe(jsRejects);
  });

  it("完了条件の不正キーはいずれも SQL 規則で拒否される", () => {
    const mustReject = [
      "gas//slide-01.pdf",
      "gas/../slide-01.pdf",
      "https://example.com/a.pdf",
      "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png",
    ];
    for (const value of mustReject) {
      expect(isRejectedBySqlPredicate(value)).toBe(true);
      expect(toSlideObjectKey(value)).toBeNull();
    }
  });

  it("正常なキーのみなら SQL 規則は何も拒否しない", () => {
    expect(isRejectedBySqlPredicate("gas/slide-01.pdf")).toBe(false);
    expect(toSlideObjectKey("gas/slide-01.pdf")).toBe("gas/slide-01.pdf");
  });
});

/**
 * Full executable statement of 20260926000000_normalize_blank_slide_pdf_url.sql (comments and blank
 * lines
 * removed; #243). Compared by exact match so added conditions (OR clauses) or SET changes are
 * detected.
 */
const BLANK_NORMALIZE_MIGRATION_STATEMENT = `UPDATE public.learning_contents
SET pdf_url = NULL
WHERE pdf_url IS NOT NULL
  AND btrim(pdf_url, E' \\t\\r\\n') = '';`;

/** Strips -- line comments and blank lines (this migration uses no block comments). */
function stripSqlLineComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line) && line.trim() !== "")
    .join("\n");
}

const BLANK_NORMALIZE_MIGRATION_FILE = resolve(
  __dirname,
  "../../supabase/migrations/20260926000000_normalize_blank_slide_pdf_url.sql"
);

function isNulledBySqlBlankPredicate(pdfUrl: string): boolean {
  return pdfUrl.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") === "";
}

describe("pdf_url 空文字の正規化: SQL と管理APIスキーマの一致 (#243)", () => {
  it("マイグレーションの実行文が定数と完全に一致する（条件の追加・変更を検出する）", () => {
    const migrationSql = readFileSync(BLANK_NORMALIZE_MIGRATION_FILE, "utf8");
    expect(stripSqlLineComments(migrationSql)).toBe(BLANK_NORMALIZE_MIGRATION_STATEMENT);
  });

  it.each(PARITY_CASES)(
    "マイグレーションが NULL 化する値と、スキーマが null に正規化する値が一致する（%s）",
    (_label, value) => {
      const sqlNulls = isNulledBySqlBlankPredicate(value);
      expect(isBlankSlidePdfUrl(value)).toBe(sqlNulls);
      const parsed = ContentUpdateSchema.safeParse({ pdf_url: value });
      if (sqlNulls) {
        expect(parsed.success).toBe(true);
        expect(parsed.data?.pdf_url).toBeNull();
      } else {
        // Non-empty values are either normalized to a key and accepted, or rejected if not
        // interpretable; never nulled.
        expect(parsed.success ? parsed.data?.pdf_url : "rejected").not.toBeNull();
      }
    }
  );

  it("#217 の検証が拒否する空の値はすべて NULL 化の対象で、NULL 行は #217 の検証が対象にしない", () => {
    // 20260917011152 aborts on empty/blank-only values. This migration nulls all of them, and both
    // the #217
    // normalization UPDATE and the validation DO exclude NULL rows via `WHERE pdf_url IS NOT NULL`
    // (as many
    // filters as normalization expression occurrences).
    for (const value of ["", "   ", "\t\r\n"]) {
      expect(isRejectedBySqlPredicate(value)).toBe(true);
      expect(isNulledBySqlBlankPredicate(value)).toBe(true);
    }
    const validationSql = readFileSync(MIGRATION_FILE, "utf8");
    expect(validationSql.split("WHERE pdf_url IS NOT NULL").length - 1).toBe(2);
  });
});
