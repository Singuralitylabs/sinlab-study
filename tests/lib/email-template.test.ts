import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_TEXTS,
  EMAIL_TEMPLATE_DEFINITIONS,
  EMAIL_TEMPLATE_KEYS,
  renderEmailBody,
  renderEmailSubject,
  resolveEmailTemplateText,
  sanitizeEmailValue,
  validateEmailTemplateText,
} from "@/app/lib/email-template";
import { renderEmailMarkdown } from "@/app/lib/markdown-email";

describe("既定値の定義", () => {
  it.each(EMAIL_TEMPLATE_KEYS)("%s: 既定の件名・本文が自分の許可リストで検証を通る", (key) => {
    const { subject, body } = EMAIL_TEMPLATE_DEFINITIONS[key];

    expect(validateEmailTemplateText(key, { subject, body }).ok).toBe(true);
  });

  it("trial_nurture は段階ごと、announcement は前後の定型文と本文の差し込み口を持つ", () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        "trial_nurture.day2",
        "trial_nurture.day5",
        "trial_nurture.day7",
        "trial_nurture.day14",
        "announcement",
      ])
    );
    expect(EMAIL_TEMPLATE_DEFINITIONS.announcement.required).toEqual(["announcement_body"]);
  });
});

describe("validateEmailTemplateText（許可リスト）", () => {
  it("許可リストに無いプレースホルダーは、どれが使えないかを返して拒否する", () => {
    const result = validateEmailTemplateText("approved", {
      subject: "件名 {{secret}}",
      body: "{{membership_label}} と {{unknown_one}}",
    });

    expect(result.ok).toBe(false);
    expect(result.unknown).toEqual(["secret", "unknown_one"]);
  });

  it("他のテンプレートのプレースホルダーは使えない", () => {
    expect(
      validateEmailTemplateText("approved", { subject: "件名", body: "{{monthly_price}}" }).unknown
    ).toEqual(["monthly_price"]);
  });

  it("波括弧の中の空白は無視して判定する（{{ display_name }}）", () => {
    expect(
      validateEmailTemplateText("approved", { subject: "件名", body: "{{ display_name }}" }).ok
    ).toBe(true);
  });

  it("announcement は本文に {{announcement_body}} が1つだけ必要（無い・重複は拒否）", () => {
    const ok = {
      subject: "お知らせ: {{title}}",
      body: "前置き\n\n{{announcement_body}}\n\n後書き",
    };
    expect(validateEmailTemplateText("announcement", ok).ok).toBe(true);
    expect(
      validateEmailTemplateText("announcement", { ...ok, body: "本文だけ" }).invalidRequired
    ).toEqual(["announcement_body"]);
    expect(
      validateEmailTemplateText("announcement", {
        ...ok,
        body: "{{announcement_body}}{{announcement_body}}",
      }).invalidRequired
    ).toEqual(["announcement_body"]);
  });

  it("本文専用のプレースホルダーは件名に使えない", () => {
    const result = validateEmailTemplateText("announcement", {
      subject: "{{announcement_body}}",
      body: "{{announcement_body}}",
    });

    expect(result.ok).toBe(false);
    expect(result.bodyOnlyInSubject).toEqual(["announcement_body"]);
  });
});

describe("Object のプロトタイプのキーは許可リストに入らない", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "{{%s}} は許可リスト外として拒否する",
    (name) => {
      const result = validateEmailTemplateText("signup", {
        subject: `x {{${name}}}`,
        body: `hi {{${name}}}`,
      });

      expect(result.ok).toBe(false);
      expect(result.unknown).toEqual([name]);
    }
  );

  it("DB に入ってしまった行でも、描画は例外にならず既定値で送る", () => {
    const texts = {
      ...DEFAULT_EMAIL_TEXTS,
      templates: { signup: { subject: "x", body: "hi {{constructor}}" } },
    };

    expect(resolveEmailTemplateText("signup", texts).body).toBe(
      EMAIL_TEMPLATE_DEFINITIONS.signup.body
    );
    expect(renderEmailBody("{{constructor}} {{toString}}", {}).text).toBe(
      "{{constructor}} {{toString}}"
    );
  });
});

describe("resolveEmailTemplateText（DB → 既定値）", () => {
  it("行が無いキーは既定値を返す", () => {
    expect(resolveEmailTemplateText("approved", DEFAULT_EMAIL_TEXTS)).toEqual({
      subject: EMAIL_TEMPLATE_DEFINITIONS.approved.subject,
      body: EMAIL_TEMPLATE_DEFINITIONS.approved.body,
    });
  });

  it("保存された行があればそれを使う", () => {
    const texts = {
      ...DEFAULT_EMAIL_TEXTS,
      templates: { approved: { subject: "変更後", body: "本文" } },
    };

    expect(resolveEmailTemplateText("approved", texts)).toEqual({
      subject: "変更後",
      body: "本文",
    });
  });

  it("DB を直接書き換えられて許可リスト外を含む行は、送信を止めず既定値に戻す", () => {
    const texts = {
      ...DEFAULT_EMAIL_TEXTS,
      templates: { approved: { subject: "変更後", body: "{{not_allowed}}" } },
    };

    expect(resolveEmailTemplateText("approved", texts).subject).toBe(
      EMAIL_TEMPLATE_DEFINITIONS.approved.subject
    );
  });
});

describe("renderEmailSubject", () => {
  it("差し込み値の改行を空白にし、件名に改行が残らない（ヘッダーインジェクション対策）", () => {
    const subject = renderEmailSubject("お知らせ: {{title}}", {
      title: "A\r\nBcc: evil@example.com\nC",
    });

    expect(subject).toBe("お知らせ: A Bcc: evil@example.com C");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("テンプレート自身に混じった改行も空白にする", () => {
    expect(renderEmailSubject("A\nB C", {})).toBe("A B C");
  });
});

describe("renderEmailBody（差し込みとエスケープ）", () => {
  it("差し込み値の Markdown 記法は解釈しない（リンク・強調・見出し）", () => {
    const rendered = renderEmailBody("こんにちは {{display_name}}", {
      display_name: "[x](https://evil.example.com) **b** # h",
    });

    expect(rendered.html).not.toContain("<a ");
    expect(rendered.html).not.toContain("<strong>");
    expect(rendered.html).toContain("[x](https://evil.example.com) **b** # h");
    expect(rendered.text).toBe("こんにちは [x](https://evil.example.com) **b** # h");
  });

  it("HTML 版は差し込み値をエスケープする（<script> や属性の引用符）", () => {
    const rendered = renderEmailBody("名前: {{display_name}}", {
      display_name: `<script>alert(1)</script>"><img src=x onerror=alert(1)>`,
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("&quot;&gt;");
  });

  it("差し込み値に改行があっても1行のまま（段落・リストを作れない）", () => {
    const rendered = renderEmailBody("名前: {{display_name}}", {
      display_name: "a\n\n- b\n# c",
    });

    expect(rendered.html).not.toContain("<ul");
    expect(rendered.html.match(/<p /g)).toHaveLength(1);
  });

  it("差し込み値に含まれる予約文字（私用領域の目印）を悪用して他の値を引き出せない", () => {
    const rendered = renderEmailBody("{{display_name}} / {{service_name}}", {
      display_name: "1",
      service_name: "SECRET",
    });

    expect(rendered.text.startsWith("1 ")).toBe(true);
    expect(rendered.text.split(" / ")[0]).not.toContain("SECRET");
  });

  it("テンプレート側の Markdown（強調・リンク）は変換され、HTML の生タグは出ない", () => {
    const rendered = renderEmailBody("**重要** [詳細](https://example.com) <b>x</b>", {});

    expect(rendered.html).toContain("<strong>重要</strong>");
    expect(rendered.html).toContain('href="https://example.com"');
    expect(rendered.html).not.toContain("<b>");
  });

  it("http(s) 以外のリンクは <a> にならない", () => {
    const rendered = renderEmailBody("[x](javascript:alert(1))", {});

    expect(rendered.html).not.toContain("<a ");
  });

  it("許可リスト外の {{...}} は値に置き換わらず、そのまま文字として残る", () => {
    const rendered = renderEmailBody("{{other}}", { display_name: "山田" });

    expect(rendered.text).toBe("{{other}}");
  });
});

describe("値が無い行の省略", () => {
  const body = "料金: {{price}}\n\n日付: {{date}}\n\n固定の行";

  it("プレースホルダーが全て空の行は、行ごと出さない", () => {
    const rendered = renderEmailBody(body, { price: "", date: "2026年11月1日" });

    expect(rendered.text).not.toContain("料金");
    expect(rendered.text).toContain("日付: 2026年11月1日");
    expect(rendered.text).toContain("固定の行");
    expect(rendered.html).not.toContain("料金");
  });

  it("空白だけの値も空とみなす", () => {
    expect(renderEmailBody("料金: {{price}}", { price: "  \n " }).text).toBe("");
  });

  it("プレースホルダーの無い行は、常に出す", () => {
    expect(renderEmailBody("固定の行", {}).text).toBe("固定の行");
  });

  it("行の中で1つでも値があれば、その行は出す（空の値は空文字になる）", () => {
    const rendered = renderEmailBody("{{a}}が経ちました。{{b}}", { a: "1週間", b: "" });

    expect(rendered.text).toBe("1週間が経ちました。");
  });
});

describe("announcement の本文差し込み", () => {
  const announcement = renderEmailMarkdown("**本文**です\n\n- a");

  it("お知らせ本文を前後の定型文の間に入れ、本文側の Markdown は変換される", () => {
    const rendered = renderEmailBody(
      "運営から\n\n■ {{title}}\n\n{{announcement_body}}\n\n以上です",
      { title: "<t>" },
      announcement
    );

    expect(rendered.text).toBe("運営から\n\n■ <t>\n\n本文です\n\n・ a\n\n以上です");
    expect(rendered.html).toContain("<strong>本文</strong>");
    expect(rendered.html).toContain("■ &lt;t&gt;");
    expect(rendered.html.indexOf("運営から")).toBeLessThan(rendered.html.indexOf("<strong>"));
    expect(rendered.html.indexOf("<strong>")).toBeLessThan(rendered.html.indexOf("以上です"));
  });

  it("本文の値を渡さないときは、差し込み口の目印を出さない", () => {
    expect(renderEmailBody("前\n\n{{announcement_body}}", {}).text).toBe("前");
  });
});

describe("sanitizeEmailValue", () => {
  it("制御文字・改行・行区切りを空白にして前後を詰める", () => {
    expect(sanitizeEmailValue(" a\r\nb c\u0000d ")).toBe("a b c d");
  });
});
