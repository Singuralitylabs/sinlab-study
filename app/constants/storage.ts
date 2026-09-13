/**
 * Supabase Storage のバケット名と配信設定。
 * スライドPDFは非公開バケットから署名付きURLで配信する（issue #89）。
 */
export const SLIDES_BUCKET = "slides";

/**
 * スライドの署名付きURLの有効期限（秒）。
 * ページ描画時にサーバー側で発行し、期限切れ後はリロードで再発行される。
 * pdf.js は表示直後に残りのチャンクを裏で取得し切るため、閲覧中に期限が切れても
 * ページ送りは失敗しない（issue #89 の検討結果）。
 */
export const SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;
