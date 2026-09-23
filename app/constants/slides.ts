/**
 * スライド番号のドメイン上限（issue #144）。
 *
 * `parsePositiveInteger()` は汎用ヘルパーのため上限を持たず、スライド番号としての
 * 妥当性はこの定数で判定する（`upload-thumbnail` の `themeId` 解釈には使わない）。
 * 既存シードの最大は20番台のため、3桁（999）に余裕を持たせた値とする。
 */
export const SLIDE_NUMBER_MAX = 999;
