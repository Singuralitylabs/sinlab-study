import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isBlankSlidePdfUrl, toSlideObjectKey } from "@/app/lib/slide-object-key";
import { ContentUpdateSchema } from "@/app/services/api/schemas";

/**
 * `20260917011152_validate_slide_pdf_url_object_keys.sql` の正規化式。
 * UPDATE / 検証 DO の両方、およびこの定数が一致していることを下のテストで担保する。
 */
const SLIDE_PDF_URL_SQL_NORMALIZE_EXPR = `regexp_replace(
      btrim(pdf_url, E' \\t\\r\\n'),
      '^(https?://[^/]+)?/storage/v1/object/public/slides/',
      ''
    )`;

/**
 * 同マイグレーションの不正判定 WHERE 句。
 * マイグレーション側とこの定数が一致していることを下のテストで担保する。
 * どちらか片方だけを変えると落ちる（#217）。
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

/** マイグレーションと同じ正規化（btrim 相当 → 旧公開URL接頭辞除去） */
const LEGACY_PUBLIC_URL_PREFIX = /^(?:https?:\/\/[^/]+)?\/storage\/v1\/object\/public\/slides\//;

function normalizeLikeMigration(pdfUrl: string): string {
  return pdfUrl.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").replace(LEGACY_PUBLIC_URL_PREFIX, "");
}

/**
 * SQL 側の拒否条件を JS で評価する（正規表現・セグメント分割は SQL 定数と対応）。
 * `toSlideObjectKey` の実装を参照せず、SQL 規則だけを再現する。
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

/** 突き合わせ用の入力集合（受け入れ・拒否の両方） */
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
    // UPDATE と検証 DO の両方で同じ正規化式を使う（片方だけ変える事故を防ぐ）
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
 * `20260926000000_normalize_blank_slide_pdf_url.sql` の NULL 化条件（#243）。
 * マイグレーション側とこの定数が一致していることを下のテストで担保する。
 */
const BLANK_PDF_URL_SQL_PREDICATE = `pdf_url IS NOT NULL
  AND btrim(pdf_url, E' \\t\\r\\n') = ''`;

const BLANK_NORMALIZE_MIGRATION_FILE = resolve(
  __dirname,
  "../../supabase/migrations/20260926000000_normalize_blank_slide_pdf_url.sql"
);

/** NULL 化条件を JS で評価する（btrim(pdf_url, E' \t\r\n') = ''） */
function isNulledBySqlBlankPredicate(pdfUrl: string): boolean {
  return pdfUrl.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") === "";
}

describe("pdf_url 空文字の正規化: SQL と管理APIスキーマの一致 (#243)", () => {
  it("マイグレーションに NULL 化条件の定数がそのまま含まれる", () => {
    const migrationSql = readFileSync(BLANK_NORMALIZE_MIGRATION_FILE, "utf8");
    expect(migrationSql).toContain(BLANK_PDF_URL_SQL_PREDICATE);
    expect(migrationSql).toContain("SET pdf_url = NULL");
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
        // 空でない値はキーへ正規化して受理するか、解釈できなければ拒否する（null にはしない）
        expect(parsed.success ? parsed.data?.pdf_url : "rejected").not.toBeNull();
      }
    }
  );

  it("空文字・空白のみは、NULL 化後に既存の SQL 検証（#217）の対象外になる", () => {
    // 20260917011152 は空文字を不正値として中断するが、NULL は WHERE pdf_url IS NOT NULL で除外される
    for (const value of ["", "   ", "\t\r\n"]) {
      expect(isRejectedBySqlPredicate(value)).toBe(true);
      expect(isNulledBySqlBlankPredicate(value)).toBe(true);
    }
  });
});
