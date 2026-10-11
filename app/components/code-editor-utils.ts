export type CodeLanguage = "javascript" | "typescript" | "gas" | "html" | "css";

// Default file name per language (form initial values and placeholders). JavaScript (.js) and GAS
// (.gs) have different extensions, so they count as separate languages.
export const DEFAULT_FILENAME_BY_LANGUAGE: Record<CodeLanguage, string> = {
  javascript: "code.js",
  typescript: "code.ts",
  gas: "code.gs",
  html: "index.html",
  css: "style.css",
};

/**
 * Single source for allowed code languages; validation of learning_contents.code_language derives
 * from it.
 */
export const CODE_LANGUAGES = Object.keys(DEFAULT_FILENAME_BY_LANGUAGE) as CodeLanguage[];

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
