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
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { cn } from "@/lib/utils";

// Shared component without "use client": no hooks or Node-only APIs, so the same implementation
// renders on the
// server (learn/demo page.tsx) and on the client (AIReviewDisplay, bundled there).
// react-markdown doesn't render raw HTML by default (no rehype-raw), so <script> etc. in Markdown
// is always
// escaped text; no extra sanitizing is done.

// Import only the languages this course uses, individually, to limit bundle size. rehype-highlight
// always
// imports lowlight's common set (37 languages), so the languages option wouldn't shrink the bundle;
// use lowlight
// directly with a minimal own rehype plugin so only registered languages are bundled.
// GAS (Google Apps Script) is JavaScript-based, so alias it to javascript.
const lowlight = createLowlight({ html, css, javascript, typescript, python, json, bash });
lowlight.registerAlias({
  html: ["xml"],
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

// Highlight only fenced code blocks (`pre > code`), not inline code. Blocks with no or an
// unregistered language
// stay plain.
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
      if (
        !language ||
        !lowlight.registered(language) ||
        !Array.isArray(node.properties.className)
      ) {
        return;
      }

      let result: ReturnType<typeof lowlight.highlight>;
      try {
        result = lowlight.highlight(language, toText(node, { whitespace: "pre" }), {
          prefix: "hljs-",
        });
      } catch {
        // If highlight.js throws (e.g. an internal grammar bug), give up highlighting and render
        // plain rather than
        // crash the whole page.
        return;
      }

      node.properties.className.unshift("hljs");
      node.children = result.children as ElementContent[];
    });
  };
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Skip re-render/re-highlight unless content/className change (in AIReviewDisplay the parent
// re-renders on
// every other form state update).
export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-stone dark:prose-invert max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlightSubset]}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
