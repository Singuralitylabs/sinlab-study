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
    const result = run(state, "cat big.txt > copy.txt");
    expect(result.stderr).toContain("大きすぎます");
    expect(run(result.state, "wc -c big.txt").stdout).toBe(`${big.length} big.txt\n`);
  });

  it("clear と help", () => {
    expect(run(start(), "clear").clear).toBe(true);
    expect(run(start(), "help").stdout).toContain("grep");
  });

  it("存在しないディレクトリ名/ への mv・cp は、ファイルを作らずに断る", () => {
    const state = start();
    const moved = run(state, "mv memo.txt nodir/");
    expect(moved.stderr).toBe("mv: cannot move 'memo.txt' to 'nodir/': Not a directory\n");
    expect(run(moved.state, "ls").stdout).toBe("memo.txt  notes.md\n");
    expect(run(state, "cp memo.txt backup/").stderr).toContain("Not a directory");
    const tree = run(state, "mkdir proj", "touch proj/a.txt").state;
    expect(run(tree, "cp -r proj backup/", "ls backup").stdout).toBe("a.txt\n");
    expect(run(tree, "mv proj newproj/", "ls").stdout).toBe("memo.txt  newproj  notes.md\n");
  });

  it("> は先に出力先を空にし、cat は出力先と同じファイルを読まない", () => {
    const state = start();
    const same = run(state, "cat memo.txt > memo.txt");
    expect(same.stderr).toBe("cat: memo.txt: input file is output file\n");
    expect(run(same.state, "wc -c memo.txt").stdout).toBe("0 memo.txt\n");
    const appended = run(state, "cat memo.txt >> memo.txt");
    expect(appended.stderr).toContain("input file is output file");
    expect(run(appended.state, "wc -l memo.txt").stdout).toBe("3 memo.txt\n");
    expect(run(state, "sort memo.txt > memo.txt", "cat memo.txt").stdout).toBe("");
    expect(run(state, "cat memo.txt | sort > memo.txt").stderr).toBe("");
    expect(run(state, "echo x > nodir/a.txt").stderr).toContain("No such file or directory");
  });

  it("$HOME などの変数を展開し、シングルクォートの中はそのまま", () => {
    const state = start();
    expect(run(state, "echo $HOME").stdout).toBe(`${TERMINAL_HOME}\n`);
    expect(run(state, 'echo "user=${USER}"').stdout).toBe("user=sinlab\n");
    expect(run(state, "echo '$HOME'").stdout).toBe("$HOME\n");
    expect(run(state, "echo a $NOPE b").stdout).toBe("a b\n");
    expect(run(state, "mkdir w", "cd w", "cd $HOME", "pwd").stdout).toBe(`${TERMINAL_HOME}\n`);
    expect(run(state, "echo $(pwd)").stderr).toContain("$( は");
  });
});
