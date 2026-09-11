"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import CodeMirror from "@uiw/react-codemirror";
import { useSyncExternalStore } from "react";
import type { CodeLanguage } from "@/app/components/code-editor-utils";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  placeholder?: string;
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

export function CodeEditor({ value, onChange, language, placeholder }: CodeEditorProps) {
  // layout.tsx のインラインスクリプトが付けた dark クラスを初期値に使う
  // （prefers-color-scheme の useEffect 遅延だとダークモード利用者が一度ライトでマウントされる）
  const isDark = useSyncExternalStore(
    subscribeDarkClass,
    getDarkClassSnapshot,
    getDarkClassServerSnapshot
  );

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
      style={{ minHeight: "200px" }}
      className="overflow-hidden rounded-md border border-input text-sm"
    />
  );
}
