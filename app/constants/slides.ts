/**
 * Domain maximum for slide numbers (#144). parsePositiveInteger() is generic with no upper bound,
 * so slide-number validity is judged by this constant (not used for upload-thumbnail's themeId
 * parsing). Existing seeds top out in the 20s, so 3 digits (999) leaves headroom.
 */
export const SLIDE_NUMBER_MAX = 999;
