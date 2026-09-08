/**
 * `learning_contents.pdf_url` に保存する値は `slides` バケット内のオブジェクトキー
 * （例: `gas/slide-01.pdf`）のみとする（issue #89）。
 *
 * 旧形式（公開URL `.../storage/v1/object/public/slides/<キー>` の完全URL・相対パス）は
 * マイグレーションで一括正規化済みだが、リリース直後の窓や管理画面の編集フォームの
 * 初期値として旧形式が流れてきても壊れないよう、ここで同じ規則でキーへ変換する。
 * Storage ポリシーは `pdf_url = storage.objects.name` の等値比較のため、
 * この正規化はマイグレーション（`20260908000000_secure_slides_bucket.sql`）の
 * `regexp_replace(btrim(pdf_url, E' \t\r\n'), ...)` と同じ規則（前後の空白・タブ・CR・LF の除去 →
 * 接頭辞除去）でなければならない。
 */
const LEGACY_PUBLIC_URL_PREFIX = /^(?:https?:\/\/[^/]+)?\/storage\/v1\/object\/public\/slides\//;

/**
 * 命名規約 `<コーススラッグ>/slide-NN.pdf`（NN は最低2桁のゼロ埋め）の構成要素。
 * アップロードAPI（キーの組み立て・自動採番の走査）と管理画面（キーの解釈）の両方が
 * ここを参照する。規約を変えるときはこのファイルだけを変更する。
 */
/** コーススラッグ（フォルダ名）は英小文字・数字・ハイフンのみ */
export const SLIDE_FOLDER_PATTERN = /^[a-z0-9-]+$/;
/** フォルダ内のファイル名 `slide-NN.pdf`（番号部分をキャプチャ） */
export const SLIDE_FILE_NAME_PATTERN = /^slide-(\d+)\.pdf$/;
/** オブジェクトキー全体 `<slug>/slide-NN.pdf`（スラッグと番号をキャプチャ） */
const SLIDE_OBJECT_KEY_PATTERN = /^([a-z0-9-]+)\/slide-(\d+)\.pdf$/;

/**
 * コーススラッグとスライド番号から命名規約どおりのオブジェクトキーを組み立てる。
 * 番号は最低2桁のゼロ埋め（1〜99 は `01`〜`99`、100 以上はそのまま桁が増える）。
 */
export function buildSlideObjectKey(folder: string, slideNumber: number): string {
  return `${folder}/slide-${String(slideNumber).padStart(2, "0")}.pdf`;
}

/**
 * pdf_url（新形式のキー、または旧形式の公開URL）をオブジェクトキーへ正規化する。
 * `slides` バケットのオブジェクトとして解釈できない値（外部URL・空文字・`/` 始まり・
 * `..` を含むパス）は null を返す。呼び出し側は null を「署名できない」として扱う。
 */
export function toSlideObjectKey(pdfUrl: string | null | undefined): string | null {
  if (!pdfUrl) {
    return null;
  }

  // マイグレーションの btrim(pdf_url, E' \t\r\n') と除去対象を厳密に揃える（String.prototype.trim は
  // 全角スペース等も除去するため使わない）
  const key = pdfUrl.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").replace(LEGACY_PUBLIC_URL_PREFIX, "");
  if (
    key === "" ||
    key.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(key) ||
    key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }

  return key;
}

/**
 * オブジェクトキーから命名規約上のコーススラッグとスライド番号を取り出す。
 * 規約に沿わないキー（旧タイムスタンプ形式など）は null を返す。
 */
export function parseSlideObjectKey(
  pdfUrl: string | null | undefined
): { folder: string; slideNumber: number } | null {
  const key = toSlideObjectKey(pdfUrl);
  const match = key?.match(SLIDE_OBJECT_KEY_PATTERN);
  if (!match) {
    return null;
  }

  const slideNumber = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(slideNumber)) {
    return null;
  }

  return { folder: match[1], slideNumber };
}
