import type { CallbackResponse, HLJSApi, Language } from "highlight.js";

// highlight.js ships no HCL grammar; this covers what Terraform examples in articles use (blocks,
// attributes, strings with ${} interpolation, heredocs, comments) without a new dependency.
export default function hcl(hljs: HLJSApi): Language {
  return {
    name: "HCL",
    keywords: {
      keyword: ["for", "in", "if", "else", "endif", "endfor"],
      literal: ["true", "false", "null"],
    },
    contains: [
      hljs.HASH_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        scope: "string",
        begin: /<<-?([A-Za-z_][\w-]*)\s*$/,
        end: /^\s*[A-Za-z_][\w-]*\s*$/,
        // The end pattern matches any bare word line; only the heredoc's own terminator closes it.
        "on:begin": (match, response) => {
          response.data._heredoc = match[1];
        },
        "on:end": (match: RegExpMatchArray, response: CallbackResponse) => {
          if (response.data._heredoc !== match[0].trim()) response.ignoreMatch();
        },
      },
      {
        scope: "string",
        begin: /"/,
        end: /"/,
        contains: [hljs.BACKSLASH_ESCAPE, { scope: "subst", begin: /\$\{/, end: /\}/ }],
      },
      hljs.C_NUMBER_MODE,
      { scope: "attr", match: /\b[A-Za-z_][\w-]*(?=\s*=(?!=))/ },
      // Block types open a line and are followed by a label or `{` (resource "aws_s3_bucket" ...).
      { scope: "section", match: /^\s*[A-Za-z_][\w-]*(?=\s+["{]|\s*\{)/ },
    ],
  };
}
