import { describe, expect, it } from "vitest";
import { buildPreviewDocument, canPreviewFiles, isPreviewLanguage } from "@/app/lib/html-preview";

const f = (filename: string, language: string, content: string) => ({
  filename,
  language,
  content,
});

describe("isPreviewLanguage / canPreviewFiles", () => {
  it("accepts only html, css and javascript", () => {
    expect(["html", "css", "javascript"].every(isPreviewLanguage)).toBe(true);
    for (const l of ["gas", "python", "sql", "typescript", "", null, undefined]) {
      expect(isPreviewLanguage(l)).toBe(false);
    }
  });

  it("rejects empty and mixed submissions", () => {
    expect(canPreviewFiles([])).toBe(false);
    expect(canPreviewFiles([f("a.sql", "sql", "x")])).toBe(false);
    expect(canPreviewFiles([f("index.html", "html", "x"), f("a.sql", "sql", "x")])).toBe(false);
    expect(canPreviewFiles([f("index.html", "html", "x"), f("m.js", "javascript", "x")])).toBe(
      true
    );
  });

  it("falls back to the extension when no language is stored", () => {
    expect(canPreviewFiles([f("index.html", "", "x")])).toBe(true);
    expect(canPreviewFiles([f("", "", "x")])).toBe(false);
  });
});

describe("buildPreviewDocument", () => {
  it("inlines same-name stylesheet and script references", () => {
    const doc = buildPreviewDocument([
      f(
        "index.html",
        "html",
        '<head><link rel="stylesheet" href="style.css"></head><body><script src="./main.js"></script></body>'
      ),
      f("style.css", "css", "body{color:red}"),
      f("main.js", "javascript", "console.log(1)"),
    ]);
    expect(doc).toContain("<style>body{color:red}</style>");
    expect(doc).toContain("<script>console.log(1)</script>");
    expect(doc).not.toContain("href=");
    expect(doc).not.toContain("src=");
  });

  it("leaves external and unmatched references untouched", () => {
    const html =
      '<link rel="stylesheet" href="https://cdn.example.com/a.css"><link rel="stylesheet" href="/abs.css"><link rel="stylesheet" href="missing.css"><script src="//x.test/a.js"></script><link rel="icon" href="style.css">';
    const doc = buildPreviewDocument([f("index.html", "html", html), f("style.css", "css", "a{}")]);
    expect(doc).toBe(html);
  });

  it("prefers index.html, else the first html file", () => {
    expect(buildPreviewDocument([f("a.html", "html", "A"), f("index.html", "html", "INDEX")])).toBe(
      "INDEX"
    );
    expect(buildPreviewDocument([f("a.html", "html", "A"), f("b.html", "html", "B")])).toBe("A");
  });

  it("wraps css-only and javascript-only submissions in an empty page", () => {
    const css = buildPreviewDocument([f("style.css", "css", "p{}")]);
    expect(css).toContain("<style>p{}</style>");
    expect(css).not.toContain("<script");
    const js = buildPreviewDocument([f("main.js", "javascript", "run()")]);
    expect(js).toContain("<script>run()</script>");
    expect(js).not.toContain("<style");
  });

  it("does not let content close the inlined element early or expand $ patterns", () => {
    const doc = buildPreviewDocument([
      f("index.html", "html", '<link rel="stylesheet" href="s.css"><script src="m.js"></script>'),
      f("s.css", "css", "/* </style><b>x</b> */ a{content:'$&'}"),
      f("m.js", "javascript", 'document.write("</script><i>x</i>"); var a="$`";'),
    ]);
    expect(doc.match(/<\/style>/g)).toHaveLength(1);
    expect(doc.match(/<\/script>/g)).toHaveLength(1);
    expect(doc).toContain("$&");
    expect(doc).toContain("$`");
  });
});
