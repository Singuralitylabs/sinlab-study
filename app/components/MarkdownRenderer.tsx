import type { Element, ElementContent, Root } from "hast";
import { toText } from "hast-util-to-text";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import html from "highlight.js/lib/languages/xml";
import { createLowlight } from "lowlight";
import { type ComponentPropsWithoutRef, memo } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { cn } from "@/lib/utils";

// Shared component without "use client": no hooks or Node-only APIs, so the same implementation
// renders on the server (learn/demo page.tsx) and on the client (AIReviewDisplay, bundled there).
// react-markdown doesn't render raw HTML by default (no rehype-raw), so <script> etc. in Markdown
// is always escaped text; no extra sanitizing is done.

// Import only the languages this course uses, individually, to limit bundle size. rehype-highlight
// always imports lowlight's common set (37 languages), so the languages option wouldn't shrink the
// bundle; use lowlight directly with a minimal own rehype plugin so only registered languages are
// bundled. GAS (Google Apps Script) is JavaScript-based, so alias it to javascript.
const lowlight = createLowlight({
  html,
  css,
  javascript,
  typescript,
  python,
  json,
  bash,
  sql,
  markdown,
});
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
// unregistered language stay plain.
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
        // plain rather than crash the whole page.
        return;
      }

      node.properties.className.unshift("hljs");
      node.children = result.children as ElementContent[];
    });
  };
}

type MarkdownTagProps<T extends "pre" | "table"> = ComponentPropsWithoutRef<T> & ExtraProps;

// The table's min-content width escapes a flex item and widens the page. Scroll inside this box.
function MarkdownTable({ node: _node, ...props }: MarkdownTagProps<"table">) {
  return (
    <div className="markdown-table-scroll">
      <table {...props} />
    </div>
  );
}

// Keep the scrollport on the pre even if a parent flex item is only barely constrained.
function MarkdownPre({ node: _node, className, ...props }: MarkdownTagProps<"pre">) {
  return <pre className={cn("max-w-full overflow-x-auto", className)} {...props} />;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Skip re-render/re-highlight unless content/className change (in AIReviewDisplay the parent
// re-renders on every other form state update).
export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-stone dark:prose-invert max-w-none min-w-0 break-words",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlightSubset]}
        components={{ pre: MarkdownPre, table: MarkdownTable }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
