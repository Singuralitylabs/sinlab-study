import { describe, expect, it } from "vitest";
import { isReadOnlyQuery, stripCommentsAndLiterals } from "../../.claude/hooks/readonly-sql.mjs";

describe("stripCommentsAndLiterals", () => {
  it("コメントとリテラルを空白に置き換える", () => {
    const stripped = stripCommentsAndLiterals("SELECT 'a' -- c\n, \"b\" /* d */ FROM t");
    expect(stripped?.replace(/\s+/g, " ")).toBe("SELECT , FROM t");
  });

  it("入れ子のブロックコメントを 1 つとして扱う", () => {
    expect(stripCommentsAndLiterals("SELECT /* a /* b */ c */ 1")).toBe("SELECT   1");
  });

  it("ドル引用を除去する", () => {
    expect(stripCommentsAndLiterals("SELECT $$x'y$$, $t$;$t$")).toBe("SELECT  ,  ");
  });

  it("閉じられていないコメント・リテラルは null を返す", () => {
    expect(stripCommentsAndLiterals("SELECT /* x")).toBeNull();
    expect(stripCommentsAndLiterals("SELECT 'x")).toBeNull();
    expect(stripCommentsAndLiterals('SELECT "x')).toBeNull();
    expect(stripCommentsAndLiterals("SELECT $t$x")).toBeNull();
  });
});

describe("isReadOnlyQuery", () => {
  describe("許可するクエリ", () => {
    it.each([
      "SELECT id, title FROM learning_contents WHERE is_published = true LIMIT 10;",
      "select * from users",
      "WITH t AS (SELECT 1) SELECT * FROM t",
      "-- comment\n/* block */ SELECT 1",
      "EXPLAIN SELECT * FROM users",
      "SHOW search_path",
      "TABLE users",
      "VALUES (1), (2)",
      "select * from users where name = 'insert' and note = 'delete; drop'",
      "select * from users where note = $$; delete from users$$",
      "select * from users where note = E'\\'; delete' -- ok",
      "select count(*) from users offset 10",
      'select * from users u where u."set" = 1',
    ])("%s", (query) => {
      expect(isReadOnlyQuery(query)).toBe(true);
    });
  });

  describe("拒否するクエリ", () => {
    it.each([
      "UPDATE users SET status = 'x'",
      "INSERT INTO users VALUES (1)",
      "DELETE FROM users",
      "DROP TABLE users",
      "WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d",
      "SELECT 1; DROP TABLE users",
      "SELECT * FROM users FOR UPDATE",
      "SELECT * FROM users FOR SHARE",
      "SELECT * FROM users FOR NO KEY UPDATE",
      "SELECT * INTO backup FROM users",
      "EXPLAIN ANALYZE SELECT 1",
      "EXPLAIN (ANALYZE, BUFFERS) SELECT 1",
      "EXPLAIN DELETE FROM users",
      "SET search_path = public",
      "BEGIN; SELECT 1; COMMIT",
      "",
      "   ",
    ])("%s", (query) => {
      expect(isReadOnlyQuery(query)).toBe(false);
    });

    it("文字列以外は拒否する", () => {
      expect(isReadOnlyQuery(undefined)).toBe(false);
      expect(isReadOnlyQuery(null)).toBe(false);
      expect(isReadOnlyQuery(123)).toBe(false);
    });
  });

  describe("コメント・リテラルの入れ子による回避", () => {
    it.each([
      "SELECT 1 -- /*\n; DELETE FROM users -- */",
      "SELECT '--' ; DELETE FROM users",
      "SELECT '/*' ; DELETE FROM users; SELECT '*/'",
      "SELECT E'\\'' ; DELETE FROM users; SELECT ''",
      'SELECT "a\'" ; DELETE FROM users; SELECT \'\' AS "b"',
      "SELECT $a$'$a$ ; DELETE FROM users; SELECT $a$'$a$",
      "SELECT 'x' /* unterminated ; DELETE FROM users",
    ])("%s", (query) => {
      expect(isReadOnlyQuery(query)).toBe(false);
    });
  });
});
