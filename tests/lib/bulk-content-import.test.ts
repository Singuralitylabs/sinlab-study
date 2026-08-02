import { describe, expect, it } from "vitest";
import { parseBulkImportCsv, validateBulkImportRows } from "@/app/lib/bulk-content-import";

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
