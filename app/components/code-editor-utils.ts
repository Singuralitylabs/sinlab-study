export type CodeLanguage =
  | "javascript"
  | "typescript"
  | "gas"
  | "html"
  | "css"
  | "sql"
  | "bash"
  | "markdown"
  | "python"
  | "json";

// Default file name per language (form initial values and placeholders). JavaScript (.js) and GAS
// (.gs) have different extensions, so they count as separate languages.
export const DEFAULT_FILENAME_BY_LANGUAGE: Record<CodeLanguage, string> = {
  javascript: "code.js",
  typescript: "code.ts",
  gas: "code.gs",
  html: "index.html",
  css: "style.css",
  sql: "query.sql",
  bash: "script.sh",
  markdown: "README.md",
  python: "main.py",
  json: "data.json",
};

/**
 * Labels for the language selects (admin form, submission forms). Keyed by CodeLanguage so a new
 * language cannot be added without a label.
 */
export const CODE_LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  gas: "GAS",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  bash: "Bash",
  markdown: "Markdown",
  python: "Python",
  json: "JSON",
};

/**
 * Single source for allowed code languages; validation of learning_contents.code_language derives
 * from it.
 */
export const CODE_LANGUAGES = Object.keys(DEFAULT_FILENAME_BY_LANGUAGE) as CodeLanguage[];

export const CODE_LANGUAGE_OPTIONS: { value: CodeLanguage; label: string }[] = CODE_LANGUAGES.map(
  (value) => ({ value, label: CODE_LANGUAGE_LABELS[value] })
);

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
