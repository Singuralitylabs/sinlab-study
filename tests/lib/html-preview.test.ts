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

  it("keeps type=module and moves defer scripts to the end of the body", () => {
    const doc = buildPreviewDocument([
      f(
        "index.html",
        "html",
        '<head><script src="m.js" type="module"></script><script src="d.js" defer></script></head><body><p>x</p></body>'
      ),
      f("m.js", "javascript", "import x from 'y'"),
      f("d.js", "javascript", "run()"),
    ]);
    expect(doc).toContain("<script type=\"module\">import x from 'y'</script>");
    expect(doc).toBe(
      "<head><script type=\"module\">import x from 'y'</script></head><body><p>x</p><script>run()</script></body>"
    );
  });

  it("appends defer scripts when there is no body", () => {
    const doc = buildPreviewDocument([
      f("index.html", "html", '<script src="d.js" defer></script><p>x</p>'),
      f("d.js", "javascript", "run()"),
    ]);
    expect(doc).toBe("<p>x</p><script>run()</script>");
  });

  it("moves defer scripts before the real </body>, not one inside a string, comment or style", () => {
    const build = (content: string) =>
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")]);
    const D = '<script src="d.js" defer></script>';
    expect(build(`<head>${D}</head><body><script>var s = "</body>";</script><p>x</p></body>`)).toBe(
      '<head></head><body><script>var s = "</body>";</script><p>x</p><script>run()</script></body>'
    );
    expect(build(`<body>${D}<!-- old: </body> --><p>x</p></body>`)).toBe(
      "<body><!-- old: </body> --><p>x</p><script>run()</script></body>"
    );
    expect(build(`<head><style>/* </body> */</style></head><body>${D}<p>x</p></body>`)).toBe(
      "<head><style>/* </body> */</style></head><body><p>x</p><script>run()</script></body>"
    );
  });

  it("puts defer scripts in front of an unclosed construct at the end, where they would not run", () => {
    const build = (content: string) =>
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")]);
    const D = '<script src="d.js" defer></script>';
    for (const tail of [
      "<!-- memo",
      "<style>p{color:red}",
      "<script>x()",
      '<link rel="stylesheet" href="s.css" ',
      "<title>t",
      '<p class="x"',
      "</body",
      "<plaintext>x</plaintext>",
    ]) {
      expect(build(`<p>x</p>${D}${tail}`)).toBe(`<p>x</p><script>run()</script>${tail}`);
    }
    expect(build(`<p>x</p>${D}<!-- memo -->`)).toBe("<p>x</p><!-- memo --><script>run()</script>");
  });

  it("does not take a </body> in an attribute value or raw text element for the element", () => {
    const build = (content: string) =>
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")]);
    const D = '<script src="d.js" defer></script>';
    expect(build(`<body><div title="</body>"></div>${D}</body>`)).toBe(
      '<body><div title="</body>"></div><script>run()</script></body>'
    );
    expect(build(`<body><xmp></body></xmp>${D}</body>`)).toBe(
      "<body><xmp></body></xmp><script>run()</script></body>"
    );
  });

  it("leaves scripts inside <template> alone, as the browser never runs them", () => {
    const content = '<body><template><script src="d.js" defer></script></template></body>';
    expect(
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")])
    ).toBe(content);
  });

  it("ends a script at </script followed by whitespace or /, as the browser does", () => {
    const doc = buildPreviewDocument([
      f(
        "index.html",
        "html",
        '<script>var a = 1;</script foo><link rel="stylesheet" href="s.css"></body>'
      ),
      f("s.css", "css", "p{}"),
    ]);
    expect(doc).toBe("<script>var a = 1;</script foo><style>p{}</style></body>");
  });

  it("keeps the prelude ahead of defer scripts that share its position", () => {
    const doc = buildPreviewDocument(
      [
        f("index.html", "html", '<!doctype html><script src="d.js" defer></script></body>'),
        f("d.js", "javascript", "run()"),
      ],
      { headPrelude: "<script>/*bridge*/</script>" }
    );
    expect(doc).toBe("<!doctype html><script>/*bridge*/</script><script>run()</script></body>");
  });

  it("escapes <!-- in script content only", () => {
    const doc = buildPreviewDocument([
      f("index.html", "html", '<link rel="stylesheet" href="s.css"><script src="m.js"></script>'),
      f("s.css", "css", "/* <!-- */"),
      f("m.js", "javascript", 'var a = "<!--<script>";'),
    ]);
    expect(doc).toContain("/* <!-- */");
    expect(doc).toContain('"<\\!--<script>"');
  });

  it("does not expand tags inside HTML comments", () => {
    const html =
      '<!-- <link rel="stylesheet" href="style.css"> --><!-- <script src="m.js"></script> --><p>x</p>';
    const doc = buildPreviewDocument([
      f("index.html", "html", html),
      f("style.css", "css", "a{}"),
      f("m.js", "javascript", "run()"),
    ]);
    expect(doc).toBe(html);
  });

  it("does not expand tag-shaped text inside inline scripts and styles", () => {
    const html =
      '<style>/* <link rel="stylesheet" href="style.css"> */</style><script>el.innerHTML = \'<link rel="stylesheet" href="style.css">\';</script>';
    const doc = buildPreviewDocument([
      f("index.html", "html", html),
      f("style.css", "css", "a{}\nb{}"),
    ]);
    expect(doc).toBe(html);
  });

  it("expands real references that follow a comment", () => {
    const doc = buildPreviewDocument([
      f("index.html", "html", '<!-- note --><link rel="stylesheet" href="style.css">'),
      f("style.css", "css", "a{}"),
    ]);
    expect(doc).toBe("<!-- note --><style>a{}</style>");
  });

  it("leaves a script that has both src and inline code untouched", () => {
    const html = '<script src="m.js">inline()</script>';
    expect(
      buildPreviewDocument([f("index.html", "html", html), f("m.js", "javascript", "run()")])
    ).toBe(html);
  });
});

describe("buildPreviewDocument の headPrelude（コンソール中継の差し込み位置）", () => {
  const P = "<script>/*bridge*/</script>";
  const html = (content: string) =>
    buildPreviewDocument([f("index.html", "html", content)], {
      headPrelude: P,
    });

  it("<head> の直後（受講生のスクリプトより前）に入れ、インライン展開したスクリプトより前に来る", () => {
    const out = buildPreviewDocument(
      [
        f(
          "index.html",
          "html",
          '<!doctype html><html><head><script src="main.js"></script></head><body></body></html>'
        ),
        f("main.js", "javascript", "run()"),
      ],
      { headPrelude: P }
    );
    expect(out).toBe(
      `<!doctype html><html><head>${P}<script>run()</script></head><body></body></html>`
    );
  });

  it("html が無い提出（JavaScript 単独）では組み立てた <head> に入れる", () => {
    const out = buildPreviewDocument([f("main.js", "javascript", "run()")], { headPrelude: P });
    expect(out).toBe(
      `<!doctype html><html><head><meta charset="utf-8">${P}</head><body><script>run()</script></body></html>`
    );
  });

  it("<header> を <head> と取り違えない", () => {
    expect(html("<!DOCTYPE html><body><header>h</header></body>")).toBe(
      `<!DOCTYPE html>${P}<body><header>h</header></body>`
    );
  });

  it("<head> が無ければ doctype の直後（document.doctype を残すため）、doctype も無ければ先頭に入れる", () => {
    expect(html("<!doctype html><p>x</p>")).toBe(`<!doctype html>${P}<p>x</p>`);
    expect(html("<!-- license --> <!doctype html><p>x</p>")).toBe(
      `<!-- license --> <!doctype html>${P}<p>x</p>`
    );
    expect(html("<p>x</p><script>1</script>")).toBe(`${P}<p>x</p><script>1</script>`);
  });

  it("数 MB の先頭コメント・空白の後の doctype も見失わず、その直後に差し込む", () => {
    const longComment = `<!--${"x".repeat(3e6)}-->`;
    expect(html(`${longComment}\n<!doctype html><p>x</p>`)).toBe(
      `${longComment}\n<!doctype html>${P}<p>x</p>`
    );
    const spaces = " ".repeat(9e6);
    expect(html(`${spaces}<!doctype html><p>x</p>`)).toBe(`${spaces}<!doctype html>${P}<p>x</p>`);
  });

  it("先頭の bogus comment（<?xml ?> 等）の後や、空白の無い <!doctypehtml> も doctype として扱う", () => {
    expect(html('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html><p>x</p>')).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>${P}<p>x</p>`
    );
    expect(html("<![CDATA[x]]><!doctype html><p>x</p>")).toBe(
      `<![CDATA[x]]><!doctype html>${P}<p>x</p>`
    );
    expect(html("<!doctypehtml><p>x</p>")).toBe(`<!doctypehtml>${P}<p>x</p>`);
  });

  it("<title> / <textarea> の中の <head> は要素として扱わない", () => {
    expect(html("<!doctype html><title>a<head>b</title><p>x</p><script>1</script>")).toBe(
      `<!doctype html>${P}<title>a<head>b</title><p>x</p><script>1</script>`
    );
    expect(html("<textarea><head></textarea><script>1</script>")).toBe(
      `${P}<textarea><head></textarea><script>1</script>`
    );
  });

  it("本文や要素の後に現れる doctype は先頭扱いしない", () => {
    expect(html("<p>x</p><!doctype html>")).toBe(`${P}<p>x</p><!doctype html>`);
  });

  it("doctype の無い文書の先頭にコメントが多数並んでも、差し込み位置の判定が固まらない", () => {
    const comments = "<!-- c -->\n".repeat(200);
    const startedAt = Date.now();
    expect(html(`${comments}<p>x</p>`)).toBe(`${P}${comments}<p>x</p>`);
    expect(html(`${comments}<!doctype html><p>x</p>`)).toBe(
      `${comments}<!doctype html>${P}<p>x</p>`
    );
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('<head> が無い文書で、学習者のスクリプト内の文字列 "<head>" に差し込まない', () => {
    const content = '<body><script>const s = "<head>";</script></body>';
    expect(html(content)).toBe(`${P}${content}`);
  });

  it("コメント・<style> の中の <head> は読み飛ばし、本物の <head> の直後に入れる", () => {
    expect(
      html(
        "<!doctype html><!-- <head> --><style>/* <head> */</style><html><head><title>t</title></head></html>"
      )
    ).toBe(
      `<!doctype html><!-- <head> --><style>/* <head> */</style><html><head>${P}<title>t</title></head></html>`
    );
  });

  it("<body> より後に現れる <head> は使わない", () => {
    expect(html("<!doctype html><body><p>x</p><head></head></body>")).toBe(
      `<!doctype html>${P}<body><p>x</p><head></head></body>`
    );
  });

  it("headPrelude を渡さなければ従来と同じ文書を返す", () => {
    const content = "<!doctype html><html><head></head><body></body></html>";
    expect(buildPreviewDocument([f("index.html", "html", content)])).toBe(content);
  });
});

describe("buildPreviewDocument の閉じていない構文", () => {
  const P = "<script>/*bridge*/</script>";
  const html = (content: string) =>
    buildPreviewDocument([f("index.html", "html", content), f("main.js", "javascript", "run()")], {
      headPrelude: P,
    });

  it.each([
    ["<head ", 60000],
    ["<body ", 60000],
    ["<link ", 60000],
    ["<!--", 80000],
    ["<script>", 40000],
    ["<style>", 40000],
  ])("%j の繰り返し（%i 回）でも線形時間で返し、内容を変えない", (unit, times) => {
    const content = `<p>x</p>${unit.repeat(times)}`;
    const startedAt = Date.now();
    const out = html(content);
    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(out).toBe(`${P}${content}`);
  });

  it("閉じていない <head・<link・<script src> は展開も差し込みもしない", () => {
    expect(html('<head <link rel="stylesheet" href="main.js"')).toBe(
      `${P}<head <link rel="stylesheet" href="main.js"`
    );
    expect(html('<p>x</p><script src="main.js">')).toBe(`${P}<p>x</p><script src="main.js">`);
  });
});

describe("buildPreviewDocument のコメントの終わり（ブラウザと同じ）", () => {
  const P = "<script>/*bridge*/</script>";
  const html = (content: string) =>
    buildPreviewDocument([f("index.html", "html", content), f("style.css", "css", "p{}")], {
      headPrelude: P,
    });

  it.each([["<!-->"], ["<!--->"], ["<!-- x --!>"]])(
    "%s でコメントが閉じ、後続の <link> 展開と <head> への差し込みが行われる",
    (comment) => {
      expect(html(`${comment}<head><link rel="stylesheet" href="style.css"></head>`)).toBe(
        `${comment}<head>${P}<style>p{}</style></head>`
      );
    }
  );

  it("<!----> と通常のコメントは従来どおり", () => {
    expect(html('<!----><!-- <link rel="stylesheet" href="style.css"> --><head></head>')).toBe(
      `<!----><!-- <link rel="stylesheet" href="style.css"> --><head>${P}</head>`
    );
  });
});
