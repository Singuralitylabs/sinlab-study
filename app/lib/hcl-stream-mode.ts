import type { StreamParser } from "@codemirror/language";

// @codemirror/legacy-modes has no HCL mode and the course only needs Terraform files read in the
// editor, so a small tokenizer here avoids a new dependency.

interface HclState {
  inBlockComment: boolean;
  // Terminator of the open heredoc (`<<EOF` / `<<-EOF`), or null outside one.
  heredoc: string | null;
}

const EXPRESSION_KEYWORDS = new Set(["for", "in", "if", "else", "endif", "endfor"]);
const LITERALS = new Set(["true", "false", "null"]);

function skipInterpolation(stream: Parameters<StreamParser<HclState>["token"]>[0]) {
  // `${ ... }` may hold quotes and braces; skip to the matching brace so a quote inside it does not
  // end the surrounding string early.
  let depth = 1;
  while (depth > 0 && !stream.eol()) {
    const ch = stream.next();
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
}

export const hcl: StreamParser<HclState> = {
  name: "hcl",
  startState: () => ({ inBlockComment: false, heredoc: null }),
  token(stream, state) {
    if (state.heredoc !== null) {
      if (stream.sol() && stream.string.trim() === state.heredoc) {
        state.heredoc = null;
      }
      stream.skipToEnd();
      return "string";
    }
    if (state.inBlockComment) {
      if (stream.skipTo("*/")) {
        stream.match("*/");
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }
    if (stream.eatSpace()) return null;

    if (stream.match("#") || stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inBlockComment = true;
      return "comment";
    }
    const heredoc = stream.match(/^<<-?([A-Za-z_][\w-]*)\s*$/);
    if (heredoc) {
      state.heredoc = (heredoc as RegExpMatchArray)[1];
      return "string";
    }
    if (stream.eat('"')) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") {
          stream.next();
        } else if (ch === "$" && stream.eat("{")) {
          skipInterpolation(stream);
        } else if (ch === '"') {
          break;
        }
      }
      return "string";
    }
    if (stream.match(/^\d+(\.\d+)?([eE][+-]?\d+)?/)) return "number";

    const word = stream.match(/^[A-Za-z_][\w-]*/);
    if (word) {
      const name = (word as RegExpMatchArray)[0];
      if (LITERALS.has(name)) return "atom";
      if (EXPRESSION_KEYWORDS.has(name)) return "keyword";
      if (stream.match(/^\s*=(?!=)/, false)) return "property";
      // A word that opens a line and is not an assignment is a block type (resource, variable...).
      if (stream.string.slice(0, stream.start).trim() === "") return "keyword";
      return "variable";
    }
    if (stream.match(/^[{}[\]()]/)) return "bracket";
    if (stream.match(/^(==|!=|<=|>=|&&|\|\||=>|[=<>!?:+\-*/%])/)) return "operator";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#", block: { open: "/*", close: "*/" } },
  },
};
