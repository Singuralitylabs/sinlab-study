import { describe, expect, it } from "vitest";
import {
  createTerminalState,
  displayTerminalPath,
  runTerminalLine,
  TERMINAL_HOME,
  TERMINAL_MAX_TOTAL_LENGTH,
  type TerminalState,
} from "@/app/lib/playground-terminal";

function run(state: TerminalState, ...lines: string[]) {
  let current = state;
  let last = runTerminalLine(current, "");
  for (const line of lines) {
    last = runTerminalLine(current, line);
    current = last.state;
  }
  return last;
}

const start = () =>
  createTerminalState([
    { filename: "memo.txt", content: "りんごを買う\nバナナを買う\nりんごジュース\n" },
    { filename: "notes.md", content: "# メモ\n" },
  ]);

describe("playground terminal", () => {
  it("ホームにファイルを置き、pwd / ls / cat が動く", () => {
    const state = start();
    expect(run(state, "pwd").stdout).toBe(`${TERMINAL_HOME}\n`);
    expect(run(state, "ls").stdout).toBe("memo.txt  notes.md\n");
    expect(run(state, "cat notes.md").stdout).toBe("# メモ\n");
    expect(displayTerminalPath(`${TERMINAL_HOME}/work`)).toBe("~/work");
  });

  it("mkdir・cd・touch・echo のリダイレクトで、ファイルを作れる", () => {
    const result = run(
      start(),
      "mkdir work",
      "cd work",
      "touch empty.txt",
      'echo "1行目" > a.txt',
      "echo 2行目 >> a.txt",
      "cat a.txt"
    );
    expect(result.stdout).toBe("1行目\n2行目\n");
    expect(run(result.state, "pwd").stdout).toBe(`${TERMINAL_HOME}/work\n`);
    expect(run(result.state, "ls").stdout).toBe("a.txt  empty.txt\n");
    expect(run(result.state, "cd ..", "pwd").stdout).toBe(`${TERMINAL_HOME}\n`);
    expect(run(result.state, "cd", "cd -").stdout).toBe(`${TERMINAL_HOME}/work\n`);
  });

  it("パイプで grep・sort・head・wc をつなげる", () => {
    const state = start();
    expect(run(state, "cat memo.txt | grep りんご").stdout).toBe("りんごを買う\nりんごジュース\n");
    expect(run(state, "grep -n バナナ memo.txt").stdout).toBe("2:バナナを買う\n");
    expect(run(state, "grep -v りんご memo.txt | wc -l").stdout).toBe("1\n");
    expect(run(state, "head -n 1 memo.txt").stdout).toBe("りんごを買う\n");
    expect(run(state, "tail -n 1 memo.txt").stdout).toBe("りんごジュース\n");
    expect(run(state, "printf x").stderr).toContain("このターミナルでは使えません");
  });

  it("* でファイル名をまとめて指定できる", () => {
    const state = run(start(), "touch a.txt b.txt").state;
    expect(run(state, "ls *.txt").stdout).toBe("a.txt  b.txt  memo.txt\n");
    expect(run(state, "rm *.txt", "ls").stdout).toBe("notes.md\n");
  });

  it("rm・mv・cp は本物と同じエラーを返し、ディレクトリには -r が要る", () => {
    const state = run(start(), "mkdir dir", "touch dir/x.txt").state;
    expect(run(state, "rm dir").stderr).toBe("rm: cannot remove 'dir': Is a directory\n");
    expect(run(state, "cp dir copy").stderr).toContain("-r not specified");
    expect(run(state, "cp -r dir copy", "ls copy").stdout).toBe("x.txt\n");
    expect(run(state, "mv memo.txt dir", "ls dir").stdout).toBe("memo.txt  x.txt\n");
    expect(run(state, "rm -r dir", "ls").stdout).toBe("memo.txt  notes.md\n");
    expect(run(state, "cat nothing.txt").stderr).toBe(
      "cat: nothing.txt: No such file or directory\n"
    );
  });

  it("いまいる場所やホームは消せず、元の状態は変えない", () => {
    const state = start();
    expect(run(state, "rm -r ~").stderr).toContain("消せません");
    const after = run(state, "rm memo.txt");
    expect(run(after.state, "ls").stdout).toBe("notes.md\n");
    expect(run(state, "ls").stdout).toBe("memo.txt  notes.md\n");
  });

  it("使えない書き方は説明つきで止める", () => {
    const state = start();
    expect(run(state, "ls; pwd").stderr).toContain("; は、このターミナルでは使えません");
    expect(run(state, "ls && pwd").stderr).toContain("&& は");
    expect(run(state, "echo 'abc").stderr).toContain("引用符");
    expect(run(state, "echo a > b > c").stderr).toContain("syntax error");
    expect(run(state, "ls -z").stderr).toContain("invalid option");
  });

  it("ファイルの合計が上限を超える書き込みは断る", () => {
    const big = "x".repeat(TERMINAL_MAX_TOTAL_LENGTH / 2 + 1);
    const state = createTerminalState([{ filename: "big.txt", content: big }]);
    const result = run(state, "cat big.txt >> big.txt");
    expect(result.stderr).toContain("大きすぎます");
    expect(run(result.state, "wc -c big.txt").stdout).toBe(`${big.length} big.txt\n`);
  });

  it("clear と help", () => {
    expect(run(start(), "clear").clear).toBe(true);
    expect(run(start(), "help").stdout).toContain("grep");
  });
});
