import type { CodeLanguage } from "@/app/components/code-editor-utils";

export const PLAYGROUND_PATH = "/playground";
export const PLAYGROUND_NAV_TITLE = "コードを試す";
export const MANAGE_PLAYGROUND_TEMPLATES_PATH = "/manage/playground-templates";

/** Template links: `/playground/t/<slug>`. */
export function playgroundTemplatePath(slug: string): string {
  return `${PLAYGROUND_PATH}/t/${slug}`;
}

/**
 * Only what runs in the browser (iframe preview, Pyodide, PGlite; Markdown / JSON / YAML are shown,
 * the terminal is a small simulation). Languages that the editor can highlight but nothing can run
 * (TypeScript, GAS, HCL, a real shell...) are left out on purpose: this page is a side feature and
 * must not pull in a heavy runtime (#583).
 */
export const PLAYGROUND_KINDS = [
  "web",
  "python",
  "sql",
  "markdown",
  "json",
  "yaml",
  "terminal",
] as const;
export type PlaygroundKind = (typeof PLAYGROUND_KINDS)[number];

export const PLAYGROUND_KIND_LABELS: Record<PlaygroundKind, string> = {
  web: "Web（HTML・CSS・JavaScript）",
  python: "Python",
  sql: "SQL",
  markdown: "Markdown",
  json: "JSON",
  yaml: "YAML",
  terminal: "ターミナル（基本コマンド）",
};

/** "text": no highlighting, for the terminal's .txt / .csv (no CodeLanguage fits, and none runs them). */
export type PlaygroundLanguage = CodeLanguage | "text";

/**
 * Extension -> stored language per kind. Mixing kinds would fall into a layout no runner accepts
 * (e.g. .py beside .html renders nothing), so a kind only accepts its own extensions.
 */
export const PLAYGROUND_EXTENSION_LANGUAGES: Record<
  PlaygroundKind,
  Readonly<Record<string, PlaygroundLanguage>>
> = {
  web: { html: "html", css: "css", js: "javascript", jsx: "javascript" },
  python: { py: "python" },
  sql: { sql: "sql" },
  markdown: { md: "markdown" },
  json: { json: "json" },
  yaml: { yaml: "yaml", yml: "yaml" },
  terminal: { txt: "text", md: "markdown", csv: "text", json: "json" },
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
  markdown: [
    {
      filename: "README.md",
      content:
        '# はじめての Markdown\n\n**太字**や*斜体*、[リンク](https://www.markdownguide.org/)が書けます。\n\n## 買い物リスト\n\n- りんご\n- バナナ\n- [x] 牛乳\n\n| 品物 | 値段 |\n| --- | ---: |\n| りんご | 150 |\n| バナナ | 100 |\n\n```python\nprint("こんにちは")\n```\n',
    },
  ],
  json: [
    {
      filename: "data.json",
      content:
        '{\n  "name": "シンラビ",\n  "age": 3,\n  "skills": ["HTML", "CSS", "JavaScript"],\n  "isMember": true\n}\n',
    },
  ],
  yaml: [
    {
      filename: "config.yaml",
      content:
        "name: シンラビ\nage: 3\nskills:\n  - HTML\n  - CSS\n  - JavaScript\nisMember: true\naddress:\n  city: 東京\n",
    },
  ],
  terminal: [
    {
      filename: "memo.txt",
      content: "りんごを買う\nバナナを買う\n部屋をそうじする\nりんごジュースを作る\n",
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
