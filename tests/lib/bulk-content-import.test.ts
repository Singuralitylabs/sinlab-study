import { describe, expect, it } from "vitest";
import {
  decodeCsvBuffer,
  parseBulkImportCsv,
  validateBulkImportRows,
} from "@/app/lib/bulk-content-import";

describe("decodeCsvBuffer", () => {
  it("UTF-8 の CSV を正しくデコードできる", () => {
    const text = "テーマ名,フェーズ名\n日本語コンテンツ,テスト";
    const buffer = new TextEncoder().encode(text).buffer;

    expect(decodeCsvBuffer(buffer)).toBe(text);
  });

  it("Shift-JIS の CSV を正しくデコードできる", () => {
    const text = "テーマ名,フェーズ名\n日本語コンテンツ,テスト";
    // 上記文字列を Shift-JIS でエンコードしたバイト列（Python の str.encode("shift_jis") で算出）
    const shiftJisBytes = new Uint8Array([
      131, 101, 129, 91, 131, 125, 150, 188, 44, 131, 116, 131, 70, 129, 91, 131, 89, 150, 188, 10,
      147, 250, 150, 123, 140, 234, 131, 82, 131, 147, 131, 101, 131, 147, 131, 99, 44, 131, 101,
      131, 88, 131, 103,
    ]);

    expect(decodeCsvBuffer(shiftJisBytes.buffer)).toBe(text);
  });
});

describe("parseBulkImportCsv", () => {
  it("CSV のヘッダーと値を正しくパースできる", () => {
    const csv = `theme_name,phase_name,week_name,title,content_type,video_url,is_published
Example Theme,Phase 1,Week 1,Intro video,video,https://youtube.com/watch?v=1,TRUE`;

    const result = parseBulkImportCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      theme_name: "Example Theme",
      phase_name: "Phase 1",
      week_name: "Week 1",
      title: "Intro video",
      content_type: "video",
      video_url: "https://youtube.com/watch?v=1",
      is_published: true,
    });
  });

  it("引用符付きのフィールドを含む CSV でも値を保持できる", () => {
    const csv = `theme_name,phase_name,week_name,title,content_type,text_content
Example Theme,Phase 1,Week 1,"Hello, world",text,"This is a long text"`;

    const result = parseBulkImportCsv(csv);

    expect(result.rows[0].title).toBe("Hello, world");
    expect(result.rows[0].text_content).toBe("This is a long text");
  });

  it("引用符内に改行を含む複数行 Markdown を1つのフィールドとして保持できる", () => {
    const csv = [
      "theme_name,phase_name,week_name,title,content_type,text_content",
      'Example Theme,Phase 1,Week 1,Markdown content,text,"# 見出し\n\n本文1行目\n本文2行目"',
      "Example Theme,Phase 1,Week 1,Next row,text,plain",
    ].join("\n");

    const result = parseBulkImportCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].text_content).toBe("# 見出し\n\n本文1行目\n本文2行目");
    expect(result.rows[1].title).toBe("Next row");
  });

  it("引用符内の CRLF 改行を LF に正規化して保持できる", () => {
    const csv = [
      "theme_name,phase_name,week_name,title,content_type,text_content",
      'Example Theme,Phase 1,Week 1,CRLF content,text,"1行目\r\n2行目"',
    ].join("\r\n");

    const result = parseBulkImportCsv(csv);

    expect(result.rows[0].text_content).toBe("1行目\n2行目");
  });

  it("完全な空行は無視する", () => {
    const csv = [
      "theme_name,phase_name,week_name,title,content_type,text_content",
      "",
      "Example Theme,Phase 1,Week 1,Row 1,text,plain",
      "",
    ].join("\n");

    const result = parseBulkImportCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe("Row 1");
  });
});

describe("validateBulkImportRows", () => {
  it("必須項目が不足している行を行番号付きで返す", () => {
    const rows = [
      {
        theme_name: "Theme",
        phase_name: "Phase",
        week_name: "Week",
        title: "Content",
        content_type: "video",
        video_url: "https://example.com",
      },
      {
        theme_name: "Theme",
        phase_name: "Phase",
        week_name: "Week",
        title: "",
        content_type: "text",
        text_content: "hello",
      },
      {
        theme_name: "Theme",
        phase_name: "Phase",
        week_name: "Week",
        title: "Bad type",
        content_type: "unknown",
        text_content: "hello",
      },
    ];

    const result = validateBulkImportRows(rows);

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].rowNumber).toBe(3);
    expect(result.errors[0].message).toContain("タイトル");
    expect(result.errors[1].rowNumber).toBe(4);
    expect(result.errors[1].message).toContain("content_type");
  });
});
