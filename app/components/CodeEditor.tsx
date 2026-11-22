"use client";

import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CodeLanguage } from "@/app/components/code-editor-utils";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** "text" (the playground's .txt / .csv) gets no highlighting. */
  language: CodeLanguage | "text";
  placeholder?: string;
  /** CSS min-height; exercises keep 200px to match CodeEditorNoSSR's loading placeholder. */
  minHeight?: string;
}

// One dynamic import per language: a static import of every package would put all of them (SQL
// dialects, Markdown pulling in HTML/CSS/JS, Python...) into the editor chunk of every exercise.
const LANGUAGE_LOADERS: Record<CodeLanguage, () => Promise<Extension[]>> = {
  javascript: () => import("@codemirror/lang-javascript").then((m) => [m.javascript()]),
  // GAS (Google Apps Script) is JavaScript-based, so it uses the same syntax.
  gas: () => import("@codemirror/lang-javascript").then((m) => [m.javascript()]),
  typescript: () =>
    import("@codemirror/lang-javascript").then((m) => [m.javascript({ typescript: true })]),
  html: () => import("@codemirror/lang-html").then((m) => [m.html()]),
  css: () => import("@codemirror/lang-css").then((m) => [m.css()]),
  // The course's SQL lessons target Supabase, so use the PostgreSQL dialect.
  sql: () => import("@codemirror/lang-sql").then((m) => [m.sql({ dialect: m.PostgreSQL })]),
  bash: () =>
    Promise.all([
      import("@codemirror/language"),
      import("@codemirror/legacy-modes/mode/shell"),
    ]).then(([{ StreamLanguage }, { shell }]) => [StreamLanguage.define(shell)]),
  markdown: () => import("@codemirror/lang-markdown").then((m) => [m.markdown()]),
  python: () => import("@codemirror/lang-python").then((m) => [m.python()]),
  json: () => import("@codemirror/lang-json").then((m) => [m.json()]),
  yaml: () =>
    Promise.all([
      import("@codemirror/language"),
      import("@codemirror/legacy-modes/mode/yaml"),
    ]).then(([{ StreamLanguage }, { yaml }]) => [StreamLanguage.define(yaml)]),
  hcl: () =>
    Promise.all([import("@codemirror/language"), import("@/app/lib/hcl-stream-mode")]).then(
      ([{ StreamLanguage }, { hcl }]) => [StreamLanguage.define(hcl)]
    ),
};

const NO_EXTENSIONS: Extension[] = [];
const DEFAULT_MIN_HEIGHT = "200px";

function subscribeDarkClass(onStoreChange: () => void) {
  const root = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getDarkClassSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getDarkClassServerSnapshot() {
  return false;
}

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  minHeight = DEFAULT_MIN_HEIGHT,
}: CodeEditorProps) {
  // Read the .dark class set before first paint so dark users don't mount in light first.
  const isDark = useSyncExternalStore(
    subscribeDarkClass,
    getDarkClassSnapshot,
    getDarkClassServerSnapshot
  );

  // The editor mounts at once without highlighting and gains it when the language chunk arrives,
  // so typing is never blocked on the download.
  const [loaded, setLoaded] = useState<{
    language: CodeEditorProps["language"];
    extensions: Extension[];
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // code_language comes from the DB as-is; a value outside the map (DB CHECK and CODE_LANGUAGES
    // out of sync) must leave a plain editor, not throw here and take the exercise page down.
    const load =
      (language === "text" ? undefined : LANGUAGE_LOADERS[language]) ??
      (() => Promise.resolve(NO_EXTENSIONS));
    load()
      .then((extensions) => {
        // Ignore a slower chunk for a language the user already switched away from.
        if (!cancelled) setLoaded({ language, extensions });
      })
      .catch((error) => console.error("エディタの言語の読み込みに失敗しました:", error));
    return () => {
      cancelled = true;
    };
  }, [language]);
  const extensions = loaded?.language === language ? loaded.extensions : NO_EXTENSIONS;

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? "dark" : "light"}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
      // A taller box also goes on CodeMirror itself, or the strip below the gutter takes no clicks.
      // The 200px default stays wrapper-only so exercise editors render exactly as before.
      minHeight={minHeight === DEFAULT_MIN_HEIGHT ? undefined : minHeight}
      style={{ minHeight }}
      className="overflow-hidden rounded-md border border-input text-sm"
    />
  );
}
