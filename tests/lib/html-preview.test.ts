import { describe, expect, it } from "vitest";
import {
  buildPreviewDocument,
  CONSOLE_NOT_ALLOWED_MESSAGE,
  canPreviewFiles,
  isPreviewLanguage,
  PREVIEW_EXERCISE_ONLY_MESSAGE,
  PREVIEW_NOT_ALLOWED_MESSAGE,
  previewCapability,
  previewSettingsError,
  resolvePreviewDisplay,
} from "@/app/lib/html-preview";

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

describe("resolvePreviewDisplay", () => {
  const html = { filename: "index.html", language: "html" };
  const css = { filename: "style.css", language: "css" };
  const js = { filename: "main.js", language: "javascript" };
  const sql = { filename: "q.sql", language: "sql" };

  it("NULL は構成ごとの自動規則になる", () => {
    expect(resolvePreviewDisplay({ files: [html, css, js] })).toEqual({
      preview: true,
      console: true,
      manualRun: false,
    });
    expect(resolvePreviewDisplay({ files: [js] })).toEqual({
      preview: false,
      console: true,
      manualRun: true,
    });
    expect(resolvePreviewDisplay({ files: [js, css] })).toEqual({
      preview: false,
      console: true,
      manualRun: true,
    });
    expect(resolvePreviewDisplay({ files: [css] })).toEqual({
      preview: false,
      console: false,
      manualRun: false,
    });
    for (const files of [[sql], [html, sql], []]) {
      expect(resolvePreviewDisplay({ files })).toEqual({
        preview: false,
        console: false,
        manualRun: false,
      });
    }
  });

  it("React 構成（App.jsx / App.js）はプレビューとコンソールが自動オン", () => {
    const appJsx = { filename: "App.jsx", language: "javascript" };
    const appJs = { filename: "App.js", language: "javascript" };
    const child = { filename: "ProductCard.jsx", language: "javascript" };
    expect(resolvePreviewDisplay({ files: [appJsx] })).toEqual({
      preview: true,
      console: true,
      manualRun: false,
    });
    expect(resolvePreviewDisplay({ files: [appJs, css] })).toEqual({
      preview: true,
      console: true,
      manualRun: false,
    });
    expect(resolvePreviewDisplay({ files: [appJsx, child, css] })).toEqual({
      preview: true,
      console: true,
      manualRun: false,
    });
    // main.js alone stays javascript-only (console, no preview)
    expect(resolvePreviewDisplay({ files: [js] }).preview).toBe(false);
    // App.jsx + html leaves the React layout (not only .jsx/.js/.css)
    expect(
      resolvePreviewDisplay({
        files: [appJsx, html],
      })
    ).toMatchObject({ preview: true, console: true });
    expect(previewCapability([appJsx])).toMatchObject({
      previewAllowed: true,
      consoleAllowed: true,
      autoPreview: true,
    });
    expect(
      previewSettingsError({
        contentType: "exercise",
        files: [appJsx],
        showPreview: true,
        showConsole: true,
      })
    ).toBeNull();
  });

  it("管理者がオンとオフを上書きでき、許されないオンは表示しない", () => {
    expect(
      resolvePreviewDisplay({ files: [html], showPreview: true, showConsole: false })
    ).toMatchObject({ preview: true, console: false, manualRun: false });
    expect(
      resolvePreviewDisplay({ files: [html], showPreview: false, showConsole: true })
    ).toMatchObject({ preview: false, console: true, manualRun: true });
    expect(resolvePreviewDisplay({ files: [js], showPreview: true })).toMatchObject({
      preview: false,
      console: true,
    });
  });

  it("矛盾するオンだけを拒否する", () => {
    expect(previewCapability([html, js])).toMatchObject({
      previewAllowed: true,
      consoleAllowed: true,
    });
    expect(previewCapability([js])).toMatchObject({
      previewAllowed: false,
      consoleAllowed: true,
    });
    expect(previewCapability([css])).toMatchObject({
      previewAllowed: false,
      consoleAllowed: false,
    });
    expect(previewCapability([css], { previewBaseHtml: '<div class="box"></div>' })).toMatchObject({
      previewAllowed: true,
      autoPreview: true,
      consoleAllowed: false,
    });
    expect(
      previewSettingsError({
        contentType: "exercise",
        files: [js],
        showPreview: true,
        showConsole: null,
      })
    ).toBe(PREVIEW_NOT_ALLOWED_MESSAGE);
    expect(
      previewSettingsError({
        contentType: "exercise",
        files: [sql],
        showPreview: null,
        showConsole: true,
      })
    ).toBe(CONSOLE_NOT_ALLOWED_MESSAGE);
    expect(
      previewSettingsError({
        contentType: "exercise",
        files: [js],
        showPreview: false,
        showConsole: false,
      })
    ).toBeNull();
    expect(previewSettingsError({ contentType: "video", files: [], showPreview: false })).toBe(
      PREVIEW_EXERCISE_ONLY_MESSAGE
    );
    expect(
      previewSettingsError({
        contentType: "video",
        files: [],
        showPreview: null,
        showConsole: null,
      })
    ).toBeNull();
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

  it("applies CSS-only submissions onto previewBaseHtml scaffold (#351)", () => {
    const doc = buildPreviewDocument([f("style.css", "css", ".box{color:red}")], {
      previewBaseHtml:
        '<!doctype html><html><head></head><body><div class="box">hi</div></body></html>',
    });
    expect(doc).toContain('<div class="box">hi</div>');
    expect(doc).toContain("<style>.box{color:red}</style>");
  });

  it("prefers submitted HTML over previewBaseHtml", () => {
    const doc = buildPreviewDocument(
      [f("index.html", "html", "<p>submitted</p>"), f("style.css", "css", "p{}")],
      { previewBaseHtml: "<p>scaffold</p>" }
    );
    expect(doc).toContain("submitted");
    expect(doc).not.toContain("scaffold");
  });

  it("ignores previewBaseHtml for javascript-only and js+css layouts (#351)", () => {
    const jsOnly = buildPreviewDocument([f("main.js", "javascript", "console.log('hi')")], {
      previewBaseHtml: "<p>scaffold</p>",
    });
    expect(jsOnly).toContain("<script>console.log('hi')</script>");
    expect(jsOnly).not.toContain("scaffold");

    const jsCss = buildPreviewDocument(
      [f("main.js", "javascript", "console.log('hi')"), f("style.css", "css", "p{}")],
      { previewBaseHtml: "<p>scaffold</p>" }
    );
    expect(jsCss).toContain("<script>console.log('hi')</script>");
    expect(jsCss).toContain("<style>p{}</style>");
    expect(jsCss).not.toContain("scaffold");
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

  it("keeps type=module and moves defer scripts to the end of the document", () => {
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
      "<head><script type=\"module\">import x from 'y'</script></head><body><p>x</p></body><script>run()</script>"
    );
  });

  it("appends defer scripts when there is no body", () => {
    const doc = buildPreviewDocument([
      f("index.html", "html", '<script src="d.js" defer></script><p>x</p>'),
      f("d.js", "javascript", "run()"),
    ]);
    expect(doc).toBe("<p>x</p><script>run()</script>");
  });

  it("appends defer scripts at the end of the document, after </body> and what follows it", () => {
    const build = (content: string) =>
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")]);
    const D = '<script src="d.js" defer></script>';
    // The browser runs defer scripts after the whole document is parsed, so #late exists by then.
    expect(build(`<body><p>a</p>${D}</body><p id="late"></p>`)).toBe(
      '<body><p>a</p></body><p id="late"></p><script>run()</script>'
    );
    expect(build(`<head></body>${D}</head><body><p id="late"></p></body>`)).toBe(
      '<head></body></head><body><p id="late"></p></body><script>run()</script>'
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
      "</ x",
      "</1",
      "</ <template <head",
    ]) {
      expect(build(`<p>x</p>${D}${tail}`)).toBe(`<p>x</p><script>run()</script>${tail}`);
    }
    expect(build(`<p>x</p>${D}<!-- memo -->`)).toBe("<p>x</p><!-- memo --><script>run()</script>");
    expect(build(`<p>x</p>${D}</ <template> >`)).toBe(
      "<p>x</p></ <template> ><script>run()</script>"
    );
  });

  it("leaves scripts inside <template> alone, as the browser never runs them", () => {
    const build = (content: string) =>
      buildPreviewDocument([f("index.html", "html", content), f("d.js", "javascript", "run()")]);
    const D = '<script src="d.js" defer></script>';
    for (const content of [
      `<body><template>${D}</template></body>`,
      `<template><!-- </template> -->${D}</template><p>x</p>`,
      `<template><template></template>${D}</template><p>x</p>`,
      `<body><template><p>${D}</body></template></body>`,
    ]) {
      expect(build(content)).toBe(content);
    }
    expect(build(`<p>x</p>${D}<template><p>y`)).toBe(
      "<p>x</p><script>run()</script><template><p>y"
    );
  });

  it("reads a tag name up to whitespace, / or >, so <body-x> or <style-x> is another element", () => {
    const build = (content: string) =>
      buildPreviewDocument(
        [
          f("index.html", "html", content),
          f("d.js", "javascript", "run()"),
          f("s.css", "css", "p{}"),
        ],
        { headPrelude: "<script>/*p*/</script>" }
      );
    expect(
      build('<body><p>a</p></body-x><div id="q"></div><script src="d.js" defer></script></body>')
    ).toBe(
      '<script>/*p*/</script><body><p>a</p></body-x><div id="q"></div></body><script>run()</script>'
    );
    expect(build('<style-x><link rel="stylesheet" href="s.css"></style-x>')).toBe(
      "<script>/*p*/</script><style-x><style>p{}</style></style-x>"
    );
    expect(build("<head-x></head-x><head></head>")).toBe(
      "<head-x></head-x><head><script>/*p*/</script></head>"
    );
    expect(build('<script>a</script\v><link rel="stylesheet" href="s.css"></script>')).toBe(
      '<script>/*p*/</script><script>a</script\v><link rel="stylesheet" href="s.css"></script>'
    );
  });

  // Regression for the scan on JavaScriptCore (also run with `bun run test:jsc`): a regex loop
  // with a frame per attribute character found no match there on a long tag, under V8 it did.
  it("inlines a script after a tag with a multi-megabyte attribute", () => {
    for (const tag of [
      `<div title="${"a".repeat(2_000_000)}">`,
      `<div data-x=${"a".repeat(2_000_000)}>`,
      `<div ${"a ".repeat(1_000_000)}>`,
    ]) {
      const doc = buildPreviewDocument([
        f("index.html", "html", `${tag}<script src="d.js"></script>`),
        f("d.js", "javascript", "run()"),
      ]);
      expect(doc.endsWith("<script>run()</script>")).toBe(true);
    }
  });

  it("reads an old-style <!--<script> block in a script as the browser does", () => {
    const build = (content: string) =>
      buildPreviewDocument([
        f("index.html", "html", content),
        f("d.js", "javascript", "run()"),
        f("s.css", "css", "p{}"),
      ]);
    const legacy =
      '<script><!--\nvar s = "<script></script>"; document.write(\'<link rel="stylesheet" href="s.css"></body>\');\n//--></script>';
    expect(build(`<body>${legacy}<script defer src="d.js"></script></body>`)).toBe(
      `<body>${legacy}</body><script>run()</script>`
    );
    // Without a "<script" after "<!--", the first "</script>" still ends it.
    expect(build('<script><!-- a </script><link rel="stylesheet" href="s.css">')).toBe(
      "<script><!-- a </script><style>p{}</style>"
    );
    expect(build('<script><!--><script></script><link rel="stylesheet" href="s.css">')).toBe(
      "<script><!--><script></script><style>p{}</style>"
    );
    expect(build('<p>x</p><script defer src="d.js"></script><script><!--<script></script>')).toBe(
      "<p>x</p><script>run()</script><script><!--<script></script>"
    );
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
        f("index.html", "html", '<!doctype html><script src="d.js" defer></script>'),
        f("d.js", "javascript", "run()"),
      ],
      { headPrelude: "<script>/*bridge*/</script>" }
    );
    expect(doc).toBe("<!doctype html><script>/*bridge*/</script><script>run()</script>");
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
    expect(html("</ x><!doctype html><p>x</p>")).toBe(`</ x><!doctype html>${P}<p>x</p>`);
    expect(html("</><!doctype html><p>x</p>")).toBe(`</><!doctype html>${P}<p>x</p>`);
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

  // Covers each findScriptEnd() state (escaped, double escaped, the "<!--" rewind and the
  // "<!--" + dashes lookahead), which plain "<script>" repeats never reach.
  it.each([
    ["<script><!--", "<script></script>", 40000],
    ["<script><!--", "-", 400000],
    ["<script>", "<!---->", 60000],
    ["<script><!--<script>", "<!--", 80000],
    ["<script><!--", "<!--<script", 60000],
  ])("%j に続く %j の繰り返し（%i 回）でも線形時間で返し、内容を変えない", (head, unit, times) => {
    const content = `<p>x</p>${head}${unit.repeat(times)}x`;
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

describe("buildPreviewDocument（React 構成 #475）", () => {
  const vendor = "https://study.example";
  const appAlone = f(
    "App.jsx",
    "javascript",
    "export default function App(){ return <h1>Hi</h1>; }"
  );

  it("単体 App.jsx で root・vendor 絶対 URL・Babel を含む", () => {
    const doc = buildPreviewDocument([appAlone], { vendorBaseUrl: vendor });
    expect(doc).toContain('<div id="root"></div>');
    expect(doc).toContain(`${vendor}/vendor/react/react.production.min.js`);
    expect(doc).toContain(`${vendor}/vendor/react/react-dom.production.min.js`);
    expect(doc).toContain(`${vendor}/vendor/react/babel.min.js`);
    expect(doc).toContain("App.jsx");
    expect(doc).toContain("createRoot");
    expect(doc).not.toContain('src="/vendor/');
  });

  it("React 内部のエラーをコンソールへ出す（opaque origin で Script error. になるため）", () => {
    const doc = buildPreviewDocument([appAlone], { vendorBaseUrl: vendor });
    expect(doc).toContain("onUncaughtError");
    expect(doc).toContain("onCaughtError");
  });

  it("2ファイル import と CSS を文書に載せる", () => {
    const doc = buildPreviewDocument(
      [
        f(
          "App.jsx",
          "javascript",
          'import ProductCard from "./ProductCard";\nexport default function App(){ return <ProductCard name="Tea" />; }'
        ),
        f(
          "ProductCard.jsx",
          "javascript",
          "export default function ProductCard({ name }){ return <p>{name}</p>; }"
        ),
        f("style.css", "css", ".card{color:red}"),
      ],
      { vendorBaseUrl: vendor }
    );
    expect(doc).toContain("ProductCard.jsx");
    expect(doc).toContain("./ProductCard");
    expect(doc).toContain("<style>.card{color:red}</style>");
  });

  it('import "./App.css" が解決できるよう CSS を空モジュール登録する', () => {
    const doc = buildPreviewDocument(
      [
        f(
          "App.jsx",
          "javascript",
          'import "./App.css";\nexport default function App(){ return <div className="x">Hi</div>; }'
        ),
        f("App.css", "css", ".x{color:red}"),
      ],
      { vendorBaseUrl: vendor }
    );
    expect(doc).toContain("<style>.x{color:red}</style>");
    expect(doc).toContain("App.css");
    expect(doc).toContain('modules[name+".css"]');
    // Source is JSON-embedded; assert the CSS import path survived into the bootstrap.
    expect(doc).toContain("./App.css");
  });

  it("欠落 import でも文書は組み立て、require 解決失敗の経路を残す", () => {
    const doc = buildPreviewDocument(
      [
        f(
          "App.jsx",
          "javascript",
          'import Missing from "./Missing";\nexport default function App(){ return <Missing />; }'
        ),
      ],
      { vendorBaseUrl: vendor }
    );
    expect(doc).toContain("./Missing");
    expect(doc).toContain('<div id="root"></div>');
    expect(doc).toContain("babel.min.js");
  });

  it("学習者コードの </script と <!-- をエスケープする", () => {
    const doc = buildPreviewDocument(
      [
        f(
          "App.jsx",
          "javascript",
          'export default function App(){ const s = "</script><img>"; const c = "<!--"; return <p>{s}</p>; }'
        ),
      ],
      { vendorBaseUrl: vendor }
    );
    expect(doc).toContain("<\\/script");
    expect(doc).toContain("<\\!--");
    // The raw sequence must not appear as an HTML end tag that would close the bootstrap script.
    expect(doc.match(/<\/script>/gi)?.length).toBeGreaterThanOrEqual(1);
    expect(doc).not.toMatch(/const s = "<\/script>/);
  });

  it("headPrelude を vendor スクリプトより前に置く", () => {
    const doc = buildPreviewDocument([appAlone], {
      headPrelude: "<script>/*bridge*/</script>",
      vendorBaseUrl: vendor,
    });
    const bridgeAt = doc.indexOf("/*bridge*/");
    const reactAt = doc.indexOf("react.production.min.js");
    expect(bridgeAt).toBeGreaterThan(-1);
    expect(reactAt).toBeGreaterThan(bridgeAt);
  });

  it("main.js のみは React 文書にしない（従来の JS 空ページ）", () => {
    const doc = buildPreviewDocument([f("main.js", "javascript", "console.log(1)")], {
      vendorBaseUrl: vendor,
    });
    expect(doc).not.toContain("babel.min.js");
    expect(doc).not.toContain('id="root"');
    expect(doc).toContain("<script>console.log(1)</script>");
  });
});
