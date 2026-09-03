export type CodeLanguage = "javascript" | "typescript" | "gas" | "html" | "css";

// 言語ごとのデフォルトファイル名（提出フォームの初期値・プレースホルダーに使用）
// JavaScript(.js) と GAS(.gs) は拡張子が異なるため別言語として扱う
export const DEFAULT_FILENAME_BY_LANGUAGE: Record<CodeLanguage, string> = {
  javascript: "code.js",
  typescript: "code.ts",
  gas: "code.gs",
  html: "index.html",
  css: "style.css",
};

// 既存のファイル名と衝突しないデフォルトファイル名を生成する（例: index.html → index-2.html）
export function buildDefaultFilename(language: CodeLanguage, existingFilenames: string[]): string {
  const base = DEFAULT_FILENAME_BY_LANGUAGE[language];
  const taken = new Set(existingFilenames.map((name) => name.trim()).filter(Boolean));
  if (!taken.has(base)) {
    return base;
  }
  const dotIndex = base.lastIndexOf(".");
  const stem = dotIndex === -1 ? base : base.slice(0, dotIndex);
  const ext = dotIndex === -1 ? "" : base.slice(dotIndex);
  let counter = 2;
  while (taken.has(`${stem}-${counter}${ext}`)) {
    counter += 1;
  }
  return `${stem}-${counter}${ext}`;
}
