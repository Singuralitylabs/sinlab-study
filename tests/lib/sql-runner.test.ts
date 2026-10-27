import { describe, expect, it } from "vitest";
import {
  acceptSqlWorkerMessage,
  buildSqlScript,
  formatSqlCell,
  formatSqlCommand,
  SQL_MAX_CELL_LENGTH,
  splitSqlStatements,
} from "@/app/lib/sql-runner";

describe("splitSqlStatements", () => {
  it("セミコロンで文を分け、前後の空白と空の文を捨てる", () => {
    expect(splitSqlStatements("SELECT 1;\n\nSELECT 2;;  \n")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("最後の文は、セミコロンがなくても実行する", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("文字列・識別子・コメントの中のセミコロンでは分けない", () => {
    expect(
      splitSqlStatements(
        `INSERT INTO t VALUES ('a;b', 'it''s;');\nSELECT "x;y" FROM t; -- 終わり; です\nSELECT /* a; /* nested; */ b; */ 1;`
      )
    ).toEqual([
      `INSERT INTO t VALUES ('a;b', 'it''s;')`,
      `SELECT "x;y" FROM t`,
      `-- 終わり; です\nSELECT /* a; /* nested; */ b; */ 1`,
    ]);
  });

  it("ドルクォートの本文は 1 つの文として扱う", () => {
    const body = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql";
    expect(splitSqlStatements(`${body}; SELECT f();`)).toEqual([body, "SELECT f()"]);
    const tagged = "SELECT $fn$ a; b $fn$";
    expect(splitSqlStatements(`${tagged};`)).toEqual([tagged]);
  });

  it("$1 のような番号付きの記号はドルクォートとして扱わない", () => {
    expect(splitSqlStatements("SELECT $1; SELECT $2;")).toEqual(["SELECT $1", "SELECT $2"]);
  });

  it("コメントだけの塊は文として数えない", () => {
    expect(splitSqlStatements("-- 準備\n/* メモ */;\nSELECT 1;\n-- 最後")).toEqual(["SELECT 1"]);
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("   \n")).toEqual([]);
  });

  it("閉じていない文字列・コメントでも、止まらずに分ける", () => {
    expect(splitSqlStatements("SELECT 'abc; SELECT 2;")).toEqual(["SELECT 'abc; SELECT 2;"]);
    // an unclosed comment swallows the rest, and a comment alone is not a statement
    expect(splitSqlStatements("SELECT 1; /* 閉じない; SELECT 2;")).toEqual(["SELECT 1"]);
  });
});

describe("buildSqlScript", () => {
  it("ファイルの内容を順に改行でつなぐ", () => {
    expect(buildSqlScript([{ content: "SELECT 1;" }, { content: "SELECT 2;" }])).toBe(
      "SELECT 1;\nSELECT 2;"
    );
  });
});

describe("formatSqlCell", () => {
  it("NULL・真偽値・数値・日付・オブジェクトを文字にする", () => {
    expect(formatSqlCell(null)).toBe("NULL");
    expect(formatSqlCell(undefined)).toBe("NULL");
    expect(formatSqlCell(true)).toBe("true");
    expect(formatSqlCell(12)).toBe("12");
    expect(formatSqlCell(9007199254740993n)).toBe("9007199254740993");
    expect(formatSqlCell(new Date("2026-01-02T00:00:00.000Z"))).toBe("2026-01-02T00:00:00.000Z");
    expect(formatSqlCell({ x: 1, big: 2n })).toBe('{"x":1,"big":"2"}');
  });

  it("文字はそのまま返し、長すぎるときは切り詰める", () => {
    expect(formatSqlCell("<b>佐藤</b>")).toBe("<b>佐藤</b>");
    const long = "あ".repeat(SQL_MAX_CELL_LENGTH + 5);
    expect(formatSqlCell(long)).toBe(`${"あ".repeat(SQL_MAX_CELL_LENGTH)}…`);
  });
});

describe("formatSqlCommand", () => {
  it("行数を数える命令は行数を出す", () => {
    expect(formatSqlCommand("insert", 2)).toBe("INSERT（2 行）");
    expect(formatSqlCommand("UPDATE", 0)).toBe("UPDATE（0 行）");
    expect(formatSqlCommand("DELETE", 1)).toBe("DELETE（1 行）");
  });

  it("それ以外は、実行したことだけを出す", () => {
    expect(formatSqlCommand("CREATE", 0)).toBe("CREATE（実行しました）");
    expect(formatSqlCommand("", 0)).toBe("実行しました");
  });
});

describe("acceptSqlWorkerMessage", () => {
  it("決まった形のメッセージだけ通す", () => {
    expect(acceptSqlWorkerMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(acceptSqlWorkerMessage({ type: "done" })).toEqual({ type: "done" });
    expect(acceptSqlWorkerMessage({ type: "fatal", message: "x" })).toEqual({
      type: "fatal",
      message: "x",
    });
    expect(
      acceptSqlWorkerMessage({
        type: "statement",
        index: 0,
        result: { kind: "rows", fields: ["id"], rows: [[1]], totalRows: 1 },
      })
    ).toEqual({
      type: "statement",
      index: 0,
      result: { kind: "rows", fields: ["id"], rows: [[1]], totalRows: 1 },
    });
    expect(
      acceptSqlWorkerMessage({
        type: "statement",
        index: 1,
        result: { kind: "error", message: "bad" },
      })
    ).toEqual({ type: "statement", index: 1, result: { kind: "error", message: "bad" } });
    expect(
      acceptSqlWorkerMessage({
        type: "statement",
        index: 2,
        result: { kind: "command", command: "INSERT", affectedRows: 1 },
      })
    ).toEqual({
      type: "statement",
      index: 2,
      result: { kind: "command", command: "INSERT", affectedRows: 1 },
    });
  });

  it("形が違うものは捨てる", () => {
    for (const bad of [
      null,
      "ready",
      { type: "other" },
      { type: "fatal" },
      { type: "statement", index: "0", result: { kind: "error", message: "x" } },
      {
        type: "statement",
        index: 0,
        result: { kind: "rows", fields: [1], rows: [], totalRows: 0 },
      },
      {
        type: "statement",
        index: 0,
        result: { kind: "rows", fields: [], rows: ["a"], totalRows: 0 },
      },
      { type: "statement", index: 0, result: { kind: "nope" } },
    ]) {
      expect(acceptSqlWorkerMessage(bad)).toBeNull();
    }
  });
});
