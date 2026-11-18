import type { CodeLanguage } from "@/app/components/code-editor-utils";

export const PLAYGROUND_PATH = "/playground";
export const PLAYGROUND_NAV_TITLE = "コードを試す";
export const MANAGE_PLAYGROUND_TEMPLATES_PATH = "/manage/playground-templates";

/** Template links: `/playground/t/<slug>`. */
export function playgroundTemplatePath(slug: string): string {
  return `${PLAYGROUND_PATH}/t/${slug}`;
}

/**
 * Only what runs in the browser (iframe preview, Pyodide, PGlite). Languages that the editor can
 * highlight but nothing can run (TypeScript, Bash, HCL...) are left out on purpose.
 */
export const PLAYGROUND_KINDS = ["web", "python", "sql"] as const;
export type PlaygroundKind = (typeof PLAYGROUND_KINDS)[number];

export const PLAYGROUND_KIND_LABELS: Record<PlaygroundKind, string> = {
  web: "Web（HTML・CSS・JavaScript）",
  python: "Python",
  sql: "SQL",
};

/**
 * Extension -> stored language per kind. Mixing kinds would fall into a layout no runner accepts
 * (e.g. .py beside .html renders nothing), so a kind only accepts its own extensions.
 */
export const PLAYGROUND_EXTENSION_LANGUAGES: Record<
  PlaygroundKind,
  Readonly<Record<string, CodeLanguage>>
> = {
  web: { html: "html", css: "css", js: "javascript", jsx: "javascript" },
  python: { py: "python" },
  sql: { sql: "sql" },
};

export const PLAYGROUND_DEFAULT_FILES: Record<
  PlaygroundKind,
  readonly { filename: string; content: string }[]
> = {
  web: [
    {
      filename: "index.html",
      content:
        '<!DOCTYPE html>\n<html lang="ja">\n  <head>\n    <meta charset="UTF-8" />\n    <link rel="stylesheet" href="style.css" />\n  </head>\n  <body>\n    <h1>こんにちは</h1>\n    <button id="button">押してみる</button>\n    <script src="script.js"></script>\n  </body>\n</html>\n',
    },
    {
      filename: "style.css",
      content: "body {\n  font-family: sans-serif;\n}\n\nh1 {\n  color: #2563eb;\n}\n",
    },
    {
      filename: "script.js",
      content:
        'const button = document.getElementById("button");\n\nbutton.addEventListener("click", () => {\n  console.log("ボタンが押されました");\n});\n', // allow-console: starter code shown to the visitor, not app output
    },
  ],
  python: [
    {
      filename: "main.py",
      content: 'name = "シンラビ"\nprint(f"こんにちは、{name}！")\n',
    },
  ],
  sql: [
    {
      filename: "query.sql",
      content:
        "CREATE TABLE fruits (id SERIAL PRIMARY KEY, name TEXT, price INTEGER);\n\nINSERT INTO fruits (name, price) VALUES ('りんご', 150), ('バナナ', 100);\n\nSELECT * FROM fruits;\n",
    },
  ],
};

/** Limits shared by the page, the template API and the DB CHECK (keep the migration in sync). */
export const PLAYGROUND_MAX_FILES = 10;
export const PLAYGROUND_MAX_FILENAME_LENGTH = 64;
export const PLAYGROUND_MAX_FILE_LENGTH = 50_000;
export const PLAYGROUND_MAX_TOTAL_LENGTH = 200_000;
export const PLAYGROUND_TEMPLATE_TITLE_MAX_LENGTH = 100;

/** 10 chars of [a-z0-9] is ~52 bits: short enough for a QR code, too many to enumerate. */
export const PLAYGROUND_TEMPLATE_SLUG_LENGTH = 10;
export const PLAYGROUND_TEMPLATE_SLUG_PATTERN = /^[a-z0-9]{10}$/;

/** Bump the version if the stored shape changes; old drafts are then ignored, not misread. */
export const PLAYGROUND_STORAGE_PREFIX = "sinlab-playground:v1";

export const PLAYGROUND_SAVE_DEBOUNCE_MS = 500;
