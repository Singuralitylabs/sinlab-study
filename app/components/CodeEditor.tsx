"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";

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

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
  minHeight?: string;
}

function getExtensions(language: CodeLanguage) {
  switch (language) {
    case "javascript":
    // GAS（Google Apps Script）はJavaScriptベースのため同じシンタックスを使用する
    case "gas":
      return [javascript()];
    case "typescript":
      return [javascript({ typescript: true })];
    case "html":
      return [html()];
    case "css":
      return [css()];
  }
}

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  minHeight = "200px",
}: CodeEditorProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={getExtensions(language)}
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
      style={{ minHeight }}
      className="overflow-hidden rounded-md border border-input text-sm"
    />
  );
}
