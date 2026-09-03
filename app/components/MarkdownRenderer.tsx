import type { Element, ElementContent, Root } from "hast";
import { toText } from "hast-util-to-text";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import html from "highlight.js/lib/languages/xml";
import { createLowlight } from "lowlight";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { cn } from "@/lib/utils";

// "use client" を持たない共有コンポーネント。hooksやNode専用APIを使わないため、
// Server Component（learn/demo の page.tsx）からはサーバーで、
// Client Component（AIReviewDisplay）からはクライアントバンドルに含まれてクライアントで、
// それぞれ同じ実装のまま描画される。
// react-markdown はデフォルトで生HTMLタグをレンダリングしない
// （rehype-raw 未導入のため、Markdown中の <script> 等は常にエスケープされたテキストとして表示される）
// ため、追加のサニタイズは行わない。

// バンドルサイズ抑制のため、対応言語をこの講座で使う範囲に限定して個別importする。
// rehype-highlightパッケージは既定でlowlightのcommon（37言語）を無条件にimportするため、
// languagesオプションで絞ってもバンドルには全言語が含まれてしまう。そのためlowlightを直接
// 利用し、登録した言語のみがバンドルに含まれる最小限のrehypeプラグインを自前で実装する。
// GAS（Google Apps Script）はJavaScriptベースのため、javascriptの別名として扱う。
const lowlight = createLowlight({ html, css, javascript, typescript, python, json, bash });
lowlight.registerAlias({
  javascript: ["js", "gas"],
  typescript: ["ts"],
  bash: ["sh", "shell"],
});

const languageClassPrefix = "language-";

function getFenceLanguage(node: Element): string | undefined {
  const className = node.properties.className;
  if (!Array.isArray(className)) {
    return undefined;
  }
  for (const value of className) {
    const name = String(value);
    if (name.startsWith(languageClassPrefix)) {
      return name.slice(languageClassPrefix.length);
    }
  }
  return undefined;
}

// fenced code block（`pre > code`）にのみハイライトを適用し、インラインコードは対象外とする。
// 言語未指定・未登録言語（lowlightに存在しない）のコードブロックはプレーン表示のまま変更しない。
function rehypeHighlightSubset() {
  return (tree: Root) => {
    visit(tree, "element", (node, _index, parent) => {
      if (
        node.tagName !== "code" ||
        !parent ||
        parent.type !== "element" ||
        parent.tagName !== "pre"
      ) {
        return;
      }

      const language = getFenceLanguage(node);
      if (!language || !lowlight.registered(language)) {
        return;
      }

      const result = lowlight.highlight(language, toText(node, { whitespace: "pre" }), {
        prefix: "hljs-",
      });

      if (!Array.isArray(node.properties.className)) {
        node.properties.className = [];
      }
      node.properties.className.unshift("hljs");
      // lowlightの出力は常にhast要素・テキストのみ（DoctypeやCommentは生成されない）
      node.children = result.children as ElementContent[];
    });
  };
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-stone dark:prose-invert max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlightSubset]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
