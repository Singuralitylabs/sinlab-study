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
import { ExternalLink } from "lucide-react";
import { type ComponentPropsWithoutRef, memo } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { isExternalHref } from "@/app/lib/external-link";
import { resolveMarkdownImageWidth } from "@/app/lib/markdown-image-width";
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

type MarkdownTagProps<T extends "pre" | "table" | "img" | "a"> = ComponentPropsWithoutRef<T> &
  ExtraProps;

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

// Cap default images; optional title `w=400` sets width (title is not shown as a tooltip then).
// maxWidth 100% keeps oversized w= values inside the prose column. No rehype-raw / raw HTML.
// Plain <img>: Markdown src may be any content-images / external URL; next/image would need a
// remote pattern per host and is not used for article embeds elsewhere either.
function MarkdownImage({
  node: _node,
  title,
  alt,
  className,
  style,
  ...props
}: MarkdownTagProps<"img">) {
  const resolved = resolveMarkdownImageWidth(typeof title === "string" ? title : undefined);
  const widthStyle = resolved.hasExplicitWidth
    ? { width: resolved.widthPx, maxWidth: "100%" as const }
    : { maxWidth: `min(100%, ${resolved.widthPx}px)` };

  return (
    // biome-ignore lint/performance/noImgElement: Markdown embeds use arbitrary Storage / URL hosts
    <img
      {...props}
      alt={alt ?? ""}
      title={resolved.displayTitle}
      className={cn("mx-auto block h-auto", className)}
      style={{ ...style, ...widthStyle }}
    />
  );
}

// External links open in a new tab so learners keep their place in the lesson. noreferrer avoids
// leaking the learner's page URL; the icon and sr-only text announce the new tab.
function MarkdownLink({ node: _node, href, children, ...props }: MarkdownTagProps<"a">) {
  if (!isExternalHref(href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      <ExternalLink
        aria-hidden="true"
        className="ml-0.5 inline-block size-[0.85em] align-baseline"
      />
      <span className="sr-only">（新しいタブで開きます）</span>
    </a>
  );
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
        components={{ pre: MarkdownPre, table: MarkdownTable, img: MarkdownImage, a: MarkdownLink }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
