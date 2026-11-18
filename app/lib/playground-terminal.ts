/**
 * A practice terminal for the playground (#583): a handful of basic commands over an in-memory file
 * tree. It is not a shell and never runs anything on a machine; a real Linux in WebAssembly would be
 * tens of MB, too heavy for a side feature. Messages copy GNU coreutils / bash so that what a
 * learner sees here matches a real Ubuntu terminal; only "not supported" is in Japanese.
 */

export const TERMINAL_USER = "sinlab";
export const TERMINAL_HOME = `/home/${TERMINAL_USER}`;
/** Characters in all files together; `cat a >> a` doubles a file each time and would exhaust memory. */
export const TERMINAL_MAX_TOTAL_LENGTH = 1_000_000;

type TerminalNode = { type: "dir" } | { type: "file"; content: string };

export interface TerminalState {
  /** Absolute normalized path -> node. "/" is always a directory. */
  nodes: ReadonlyMap<string, TerminalNode>;
  cwd: string;
  previousCwd: string | null;
}

export interface TerminalResult {
  state: TerminalState;
  stdout: string;
  stderr: string;
  clear: boolean;
}

export const TERMINAL_COMMANDS = [
  "help",
  "pwd",
  "ls",
  "cd",
  "mkdir",
  "touch",
  "cat",
  "echo",
  "rm",
  "mv",
  "cp",
  "head",
  "tail",
  "wc",
  "grep",
  "sort",
  "whoami",
  "clear",
] as const;

const HELP_TEXT = `このターミナルは練習用です。次のコマンドを再現しています。
  pwd                     いまいるディレクトリを表示
  ls [-a] [-l] [パス]     ファイルの一覧
  cd [パス]               ディレクトリを移動（~ は ${TERMINAL_HOME}、- は直前の場所）
  mkdir [-p] ディレクトリ  ディレクトリを作る
  touch ファイル           空のファイルを作る
  cat ファイル             中身を表示
  echo 文字               文字を表示（> で上書き、>> で追記）
  rm [-r] [-f] パス        削除
  mv 元 先 / cp [-r] 元 先  移動・名前の変更 / コピー
  head / tail [-n 行数]    先頭 / 末尾の行
  wc [-l] [-w] [-c]       行数・単語数・文字数
  grep [-i] [-n] [-v] 文字 文字を含む行
  sort [-r] [-n]          並べ替え
  whoami / clear          ユーザー名 / 画面を消す
パイプ（|）とリダイレクト（> >>）、* によるファイル名の指定、$HOME $USER $PWD も使えます。`;

const NOT_SUPPORTED = (name: string) =>
  `${name}: このターミナルでは使えません（練習用に一部のコマンドだけ再現しています。help で一覧を表示）`;

export function createTerminalState(
  files: readonly { filename: string; content: string }[]
): TerminalState {
  const nodes = new Map<string, TerminalNode>([
    ["/", { type: "dir" }],
    ["/home", { type: "dir" }],
    [TERMINAL_HOME, { type: "dir" }],
    ["/tmp", { type: "dir" }],
  ]);
  for (const file of files) {
    nodes.set(`${TERMINAL_HOME}/${file.filename.trim()}`, { type: "file", content: file.content });
  }
  return { nodes, cwd: TERMINAL_HOME, previousCwd: null };
}

/** "~" for the home directory, as bash shows it in the prompt. */
export function displayTerminalPath(path: string): string {
  if (path === TERMINAL_HOME) {
    return "~";
  }
  return path.startsWith(`${TERMINAL_HOME}/`) ? `~${path.slice(TERMINAL_HOME.length)}` : path;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function baseName(path: string): string {
  return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
}

function resolvePath(cwd: string, input: string): string {
  let raw = input;
  if (raw === "~" || raw.startsWith("~/")) {
    raw = TERMINAL_HOME + raw.slice(1);
  }
  const parts = (raw.startsWith("/") ? raw : `${cwd}/${raw}`).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return `/${stack.join("/")}`;
}

function childrenOf(nodes: ReadonlyMap<string, TerminalNode>, dir: string): string[] {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  const names: string[] = [];
  for (const path of nodes.keys()) {
    if (path !== "/" && path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) {
      names.push(path.slice(prefix.length));
    }
  }
  // GNU ls in a UTF-8 locale ignores case; a plain sort is close enough for practice.
  return names.sort((a, b) => a.localeCompare(b, "ja"));
}

type Token = { text: string; quoted: boolean } | { op: "|" | ">" | ">>" };

/** Splits like a shell for the parts this terminal supports; other operators are reported. */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*/;

/**
 * `$NAME` / `${NAME}` outside single quotes, as bash does. Unknown names become empty (bash prints
 * nothing for an unset variable); a lone `$` stays as typed. Returns the text and characters used.
 */
function expandVariable(
  line: string,
  start: number,
  variables: Readonly<Record<string, string>>
): { text: string; length: number } {
  const braced = line[start + 1] === "{";
  const rest = line.slice(start + (braced ? 2 : 1));
  const name = VARIABLE_NAME.exec(rest)?.[0];
  if (!name || (braced && rest[name.length] !== "}")) {
    return { text: "$", length: 1 };
  }
  return { text: variables[name] ?? "", length: name.length + (braced ? 3 : 1) };
}

/** Splits like a shell for the parts this terminal supports; other operators are reported. */
function tokenize(
  line: string,
  variables: Readonly<Record<string, string>>
): { tokens: Token[]; error: string | null } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === "|") {
      if (line[i + 1] === "|") {
        return { tokens, error: "|| は、このターミナルでは使えません" };
      }
      tokens.push({ op: "|" });
      i++;
      continue;
    }
    if (ch === ">") {
      const append = line[i + 1] === ">";
      tokens.push({ op: append ? ">>" : ">" });
      i += append ? 2 : 1;
      continue;
    }
    if (ch === ";" || ch === "&" || ch === "<" || ch === "`") {
      const op = ch === "&" && line[i + 1] === "&" ? "&&" : ch;
      return {
        tokens,
        error: `${op} は、このターミナルでは使えません（1行に1つのコマンドを書いてください）`,
      };
    }
    let text = "";
    let quoted = false;
    while (i < line.length && !" \t|><;&`".includes(line[i])) {
      const c = line[i];
      if (c === "$" && line[i + 1] === "(") {
        return { tokens, error: "$( は、このターミナルでは使えません" };
      }
      if (c === "'") {
        const end = line.indexOf(c, i + 1);
        if (end === -1) {
          return { tokens, error: "引用符（' または \"）が閉じていません" };
        }
        text += line.slice(i + 1, end);
        quoted = true;
        i = end + 1;
      } else if (c === '"') {
        const end = line.indexOf(c, i + 1);
        if (end === -1) {
          return { tokens, error: "引用符（' または \"）が閉じていません" };
        }
        let j = i + 1;
        while (j < end) {
          if (line[j] === "$" && line[j + 1] === "(") {
            return { tokens, error: "$( は、このターミナルでは使えません" };
          }
          if (line[j] === "$") {
            const expanded = expandVariable(line, j, variables);
            text += expanded.text;
            j += expanded.length;
          } else {
            text += line[j];
            j++;
          }
        }
        quoted = true;
        i = end + 1;
      } else if (c === "\\" && i + 1 < line.length) {
        text += line[i + 1];
        quoted = true;
        i += 2;
      } else if (c === "$") {
        const expanded = expandVariable(line, i, variables);
        text += expanded.text;
        i += expanded.length;
      } else {
        text += c;
        i++;
      }
    }
    // An unquoted variable that expands to nothing leaves no word, as in bash.
    if (quoted || text !== "") {
      tokens.push({ text, quoted });
    }
  }
  return { tokens, error: null };
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** `*` / `?` in the last path segment, like bash: no match leaves the word as typed. */
function expandGlob(state: TerminalState, word: string): string[] {
  const slash = word.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
  const pattern = word.slice(slash + 1);
  if (!/[*?]/.test(pattern) || /[*?]/.test(dirPart)) {
    return [word];
  }
  const dir = resolvePath(state.cwd, dirPart || ".");
  const regex = globToRegExp(pattern);
  const matches = childrenOf(state.nodes, dir)
    .filter((name) => (pattern.startsWith(".") || !name.startsWith(".")) && regex.test(name))
    .map((name) => dirPart + name);
  return matches.length > 0 ? matches : [word];
}

interface CommandIo {
  stdin: string | null;
  out: string[];
  err: string[];
}

type Fs = Map<string, TerminalNode>;

function totalLength(nodes: ReadonlyMap<string, TerminalNode>): number {
  let total = 0;
  for (const node of nodes.values()) {
    if (node.type === "file") {
      total += node.content.length;
    }
  }
  return total;
}

function writeFile(fs: Fs, path: string, content: string, err: string[], name: string): boolean {
  const parent = fs.get(parentOf(path));
  if (!parent) {
    err.push(`${name}: ${path}: No such file or directory`);
    return false;
  }
  if (parent.type !== "dir") {
    err.push(`${name}: ${path}: Not a directory`);
    return false;
  }
  if (fs.get(path)?.type === "dir") {
    err.push(`${name}: ${path}: Is a directory`);
    return false;
  }
  const previous = fs.get(path);
  const growth = content.length - (previous?.type === "file" ? previous.content.length : 0);
  if (totalLength(fs) + growth > TERMINAL_MAX_TOTAL_LENGTH) {
    err.push(
      `${name}: ファイルの合計が大きすぎます（${TERMINAL_MAX_TOTAL_LENGTH.toLocaleString()}文字まで）`
    );
    return false;
  }
  fs.set(path, { type: "file", content });
  return true;
}

/** Splits `-abc` style flags off the front; `--` ends them. Unknown flags are reported. */
function parseFlags(
  name: string,
  args: string[],
  allowed: string,
  err: string[]
): { flags: Set<string>; rest: string[] } | null {
  const flags = new Set<string>();
  const rest: string[] = [];
  let done = false;
  for (const arg of args) {
    if (!done && arg === "--") {
      done = true;
    } else if (!done && arg.startsWith("-") && arg.length > 1 && !/^-\d+$/.test(arg)) {
      for (const flag of arg.slice(1)) {
        if (!allowed.includes(flag)) {
          err.push(
            `${name}: invalid option -- '${flag}'（このターミナルで使えるのは ${allowed
              .split("")
              .map((f) => `-${f}`)
              .join(" ")}）`
          );
          return null;
        }
        flags.add(flag);
      }
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

function readInputs(fs: Fs, cwd: string, name: string, files: string[], io: CommandIo): string[] {
  if (files.length === 0) {
    return [io.stdin ?? ""];
  }
  const contents: string[] = [];
  for (const file of files) {
    const node = fs.get(resolvePath(cwd, file));
    if (!node) {
      io.err.push(`${name}: ${file}: No such file or directory`);
    } else if (node.type === "dir") {
      io.err.push(`${name}: ${file}: Is a directory`);
    } else {
      contents.push(node.content);
    }
  }
  return contents;
}

function splitLines(text: string): string[] {
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function joinLines(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function lineCountOption(
  name: string,
  args: string[],
  err: string[]
): { count: number; rest: string[] } | null {
  let count = 10;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-n") {
      const value = Number(args[i + 1]);
      if (!Number.isInteger(value) || value < 0) {
        err.push(`${name}: invalid number of lines: '${args[i + 1] ?? ""}'`);
        return null;
      }
      count = value;
      i++;
    } else if (/^-n?\d+$/.test(arg)) {
      count = Number(arg.replace(/^-n?/, ""));
    } else if (arg.startsWith("-") && arg.length > 1) {
      err.push(`${name}: invalid option -- '${arg.slice(1)}'（このターミナルで使えるのは -n）`);
      return null;
    } else {
      rest.push(arg);
    }
  }
  return { count, rest };
}

interface Session {
  fs: Fs;
  cwd: string;
  previousCwd: string | null;
  clear: boolean;
  /** Target of `>` / `>>` on this line. */
  redirectPath: string | null;
  /** Where this command's stdout goes when it is a file: cat refuses to read it, as GNU cat does. */
  stdoutPath: string | null;
}

function runCommand(session: Session, name: string, args: string[], io: CommandIo): void {
  const { fs } = session;
  const at = (path: string) => resolvePath(session.cwd, path);
  switch (name) {
    case "help":
      io.out.push(`${HELP_TEXT}\n`);
      return;
    case "pwd":
      io.out.push(`${session.cwd}\n`);
      return;
    case "whoami":
      io.out.push(`${TERMINAL_USER}\n`);
      return;
    case "clear":
      session.clear = true;
      return;
    case "echo": {
      const newline = args[0] !== "-n";
      io.out.push(`${(newline ? args : args.slice(1)).join(" ")}${newline ? "\n" : ""}`);
      return;
    }
    case "cd": {
      if (args.length > 1) {
        io.err.push("bash: cd: too many arguments");
        return;
      }
      const target = args[0] ?? "~";
      if (target === "-") {
        if (!session.previousCwd) {
          io.err.push("bash: cd: OLDPWD not set");
          return;
        }
        io.out.push(`${session.previousCwd}\n`);
      }
      const path = target === "-" ? (session.previousCwd as string) : at(target);
      const node = fs.get(path);
      if (!node) {
        io.err.push(`bash: cd: ${target}: No such file or directory`);
      } else if (node.type !== "dir") {
        io.err.push(`bash: cd: ${target}: Not a directory`);
      } else {
        session.previousCwd = session.cwd;
        session.cwd = path;
      }
      return;
    }
    case "ls": {
      const parsed = parseFlags("ls", args, "al", io.err);
      if (!parsed) {
        return;
      }
      const all = parsed.flags.has("a");
      const long = parsed.flags.has("l");
      const targets = parsed.rest.length > 0 ? parsed.rest : ["."];
      const formatEntry = (path: string, label: string) => {
        if (!long) {
          return label;
        }
        const node = fs.get(path);
        const isDir = node?.type === "dir";
        const size = node?.type === "file" ? new TextEncoder().encode(node.content).length : 4096;
        return `${isDir ? "drwxr-xr-x" : "-rw-r--r--"} 1 ${TERMINAL_USER} ${TERMINAL_USER} ${String(size).padStart(5)} ${label}`;
      };
      const blocks: string[] = [];
      const fileEntries: string[] = [];
      const dirTargets: string[] = [];
      for (const target of targets) {
        const node = fs.get(at(target));
        if (!node) {
          io.err.push(`ls: cannot access '${target}': No such file or directory`);
        } else if (node.type === "file") {
          fileEntries.push(formatEntry(at(target), target));
        } else {
          dirTargets.push(target);
        }
      }
      if (fileEntries.length > 0) {
        blocks.push(fileEntries.join(long ? "\n" : "  "));
      }
      for (const target of dirTargets) {
        const dir = at(target);
        const names = childrenOf(fs, dir).filter((child) => all || !child.startsWith("."));
        const entries = [...(all ? [".", ".."] : []), ...names].map((child) =>
          formatEntry(
            child === "."
              ? dir
              : child === ".."
                ? parentOf(dir)
                : `${dir === "/" ? "" : dir}/${child}`,
            child
          )
        );
        const body = long
          ? [`total ${names.length * 4}`, ...entries].join("\n")
          : entries.join("  ");
        const header = targets.length > 1 ? `${target}:\n` : "";
        blocks.push(header + body);
      }
      const text = blocks.filter((block) => block !== "").join("\n\n");
      if (text) {
        io.out.push(`${text}\n`);
      }
      return;
    }
    case "mkdir": {
      const parsed = parseFlags("mkdir", args, "p", io.err);
      if (!parsed) {
        return;
      }
      if (parsed.rest.length === 0) {
        io.err.push("mkdir: missing operand");
        return;
      }
      for (const dir of parsed.rest) {
        const path = at(dir);
        if (parsed.flags.has("p")) {
          const parts = path.split("/").filter(Boolean);
          let current = "";
          for (const part of parts) {
            current += `/${part}`;
            const node = fs.get(current);
            if (node?.type === "file") {
              io.err.push(`mkdir: cannot create directory '${dir}': Not a directory`);
              break;
            }
            if (!node) {
              fs.set(current, { type: "dir" });
            }
          }
        } else if (fs.has(path)) {
          io.err.push(`mkdir: cannot create directory '${dir}': File exists`);
        } else if (fs.get(parentOf(path))?.type !== "dir") {
          io.err.push(`mkdir: cannot create directory '${dir}': No such file or directory`);
        } else {
          fs.set(path, { type: "dir" });
        }
      }
      return;
    }
    case "touch": {
      if (args.length === 0) {
        io.err.push("touch: missing file operand");
        return;
      }
      for (const file of args) {
        if (!fs.has(at(file))) {
          writeFile(fs, at(file), "", io.err, "touch");
        }
      }
      return;
    }
    case "cat": {
      const parsed = parseFlags("cat", args, "n", io.err);
      if (!parsed) {
        return;
      }
      const inputs = parsed.rest.filter((file) => {
        if (at(file) !== session.stdoutPath) {
          return true;
        }
        io.err.push(`cat: ${file}: input file is output file`);
        return false;
      });
      if (parsed.rest.length > 0 && inputs.length === 0) {
        return;
      }
      const text = readInputs(fs, session.cwd, "cat", inputs, io).join("");
      io.out.push(
        parsed.flags.has("n")
          ? joinLines(splitLines(text).map((line, i) => `${String(i + 1).padStart(6)}\t${line}`))
          : text
      );
      return;
    }
    case "rm": {
      const parsed = parseFlags("rm", args, "rf", io.err);
      if (!parsed) {
        return;
      }
      if (parsed.rest.length === 0) {
        io.err.push("rm: missing operand");
        return;
      }
      for (const target of parsed.rest) {
        const path = at(target);
        const node = fs.get(path);
        if (!node) {
          if (!parsed.flags.has("f")) {
            io.err.push(`rm: cannot remove '${target}': No such file or directory`);
          }
        } else if (node.type === "dir" && !parsed.flags.has("r")) {
          io.err.push(`rm: cannot remove '${target}': Is a directory`);
        } else if (
          path === "/" ||
          path === TERMINAL_HOME ||
          session.cwd.startsWith(`${path}/`) ||
          session.cwd === path
        ) {
          // Removing where you stand (or / itself) would leave the prompt pointing nowhere.
          io.err.push(`rm: '${target}' は、いまいる場所かその上なので消せません（練習用の制限）`);
        } else {
          for (const key of [...fs.keys()]) {
            if (key === path || key.startsWith(`${path}/`)) {
              fs.delete(key);
            }
          }
        }
      }
      return;
    }
    case "mv":
    case "cp": {
      const parsed = parseFlags(name, args, name === "cp" ? "r" : "", io.err);
      if (!parsed) {
        return;
      }
      if (parsed.rest.length < 2) {
        io.err.push(
          parsed.rest.length === 0
            ? `${name}: missing file operand`
            : `${name}: missing destination file operand after '${parsed.rest[0]}'`
        );
        return;
      }
      const sources = parsed.rest.slice(0, -1);
      const destination = parsed.rest[parsed.rest.length - 1];
      const destinationPath = at(destination);
      const destinationIsDir = fs.get(destinationPath)?.type === "dir";
      if (sources.length > 1 && !destinationIsDir) {
        io.err.push(`${name}: target '${destination}': Not a directory`);
        return;
      }
      for (const source of sources) {
        const sourcePath = at(source);
        const node = fs.get(sourcePath);
        if (!node) {
          io.err.push(`${name}: cannot stat '${source}': No such file or directory`);
          continue;
        }
        // resolvePath drops the trailing slash, so `mv a.txt nodir/` would otherwise create a
        // file. A directory source may take a new name ending in / (`cp -r proj backup/`).
        if (destination.endsWith("/") && !destinationIsDir && node.type === "file") {
          io.err.push(
            name === "mv"
              ? `mv: cannot move '${source}' to '${destination}': Not a directory`
              : `cp: cannot create regular file '${destination}': Not a directory`
          );
          continue;
        }
        const target = destinationIsDir
          ? `${destinationPath === "/" ? "" : destinationPath}/${baseName(sourcePath)}`
          : destinationPath;
        if (target === sourcePath) {
          io.err.push(`${name}: '${source}' and '${destination}' are the same file`);
          continue;
        }
        if (node.type === "dir") {
          if (name === "cp" && !parsed.flags.has("r")) {
            io.err.push(`cp: -r not specified; omitting directory '${source}'`);
            continue;
          }
          // A directory never replaces a file (that would silently lose the file's content).
          if (fs.get(target)?.type === "file") {
            io.err.push(
              destination.endsWith("/")
                ? `${name}: cannot stat '${destination}': Not a directory`
                : `${name}: cannot overwrite non-directory '${destination}' with directory '${source}'`
            );
            continue;
          }
          if (target.startsWith(`${sourcePath}/`)) {
            io.err.push(
              `${name}: cannot ${name === "cp" ? "copy" : "move"} a directory, '${source}', into itself`
            );
            continue;
          }
          if (fs.get(parentOf(target))?.type !== "dir") {
            io.err.push(
              `${name}: cannot create directory '${destination}': No such file or directory`
            );
            continue;
          }
          const moved = [...fs.entries()].filter(
            ([key]) => key === sourcePath || key.startsWith(`${sourcePath}/`)
          );
          if (name === "mv") {
            if (session.cwd === sourcePath || session.cwd.startsWith(`${sourcePath}/`)) {
              io.err.push(
                `mv: '${source}' は、いまいる場所かその上なので動かせません（練習用の制限）`
              );
              continue;
            }
            for (const [key] of moved) {
              fs.delete(key);
            }
          }
          for (const [key, value] of moved) {
            fs.set(target + key.slice(sourcePath.length), value);
          }
        } else if (writeFile(fs, target, node.content, io.err, name) && name === "mv") {
          fs.delete(sourcePath);
        }
      }
      return;
    }
    case "head":
    case "tail": {
      const parsed = lineCountOption(name, args, io.err);
      if (!parsed) {
        return;
      }
      const lines = splitLines(readInputs(fs, session.cwd, name, parsed.rest, io).join(""));
      const picked =
        name === "head"
          ? lines.slice(0, parsed.count)
          : parsed.count === 0
            ? []
            : lines.slice(-parsed.count);
      io.out.push(joinLines(picked));
      return;
    }
    case "wc": {
      const parsed = parseFlags("wc", args, "lwc", io.err);
      if (!parsed) {
        return;
      }
      const show = parsed.flags.size === 0 ? new Set(["l", "w", "c"]) : parsed.flags;
      const count = (text: string) =>
        [
          show.has("l") ? (text.match(/\n/g) ?? []).length : null,
          show.has("w") ? text.split(/\s+/).filter(Boolean).length : null,
          show.has("c") ? new TextEncoder().encode(text).length : null,
        ].filter((value): value is number => value !== null);
      if (parsed.rest.length === 0) {
        io.out.push(`${count(io.stdin ?? "").join(" ")}\n`);
        return;
      }
      for (const file of parsed.rest) {
        const [text] = readInputs(fs, session.cwd, "wc", [file], io);
        if (text !== undefined) {
          io.out.push(`${count(text).join(" ")} ${file}\n`);
        }
      }
      return;
    }
    case "grep": {
      const parsed = parseFlags("grep", args, "inv", io.err);
      if (!parsed) {
        return;
      }
      const [pattern, ...files] = parsed.rest;
      if (pattern === undefined) {
        io.err.push("Usage: grep [-i] [-n] [-v] 文字 [ファイル]...");
        return;
      }
      // Fixed strings only: regular expressions are a topic of their own.
      const needle = parsed.flags.has("i") ? pattern.toLowerCase() : pattern;
      const sources = files.length > 0 ? files : [null];
      for (const file of sources) {
        const [text] =
          file === null ? [io.stdin ?? ""] : readInputs(fs, session.cwd, "grep", [file], io);
        if (text === undefined) {
          continue;
        }
        splitLines(text).forEach((line, index) => {
          const haystack = parsed.flags.has("i") ? line.toLowerCase() : line;
          if (haystack.includes(needle) !== parsed.flags.has("v")) {
            const prefix = `${files.length > 1 ? `${file}:` : ""}${parsed.flags.has("n") ? `${index + 1}:` : ""}`;
            io.out.push(`${prefix}${line}\n`);
          }
        });
      }
      return;
    }
    case "sort": {
      const parsed = parseFlags("sort", args, "rn", io.err);
      if (!parsed) {
        return;
      }
      const lines = splitLines(readInputs(fs, session.cwd, "sort", parsed.rest, io).join(""));
      const sorted = parsed.flags.has("n")
        ? lines.sort((a, b) => (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0))
        : lines.sort((a, b) => a.localeCompare(b, "ja"));
      io.out.push(joinLines(parsed.flags.has("r") ? sorted.reverse() : sorted));
      return;
    }
    default:
      io.err.push(NOT_SUPPORTED(name));
  }
}

export function runTerminalLine(state: TerminalState, line: string): TerminalResult {
  const unchanged = { state, stdout: "", stderr: "", clear: false };
  const { tokens, error } = tokenize(line, {
    HOME: TERMINAL_HOME,
    USER: TERMINAL_USER,
    PWD: state.cwd,
    OLDPWD: state.previousCwd ?? "",
  });
  if (error) {
    return { ...unchanged, stderr: `${error}\n` };
  }
  if (tokens.length === 0) {
    return unchanged;
  }

  // Redirection: only at the end of the line, as `cmd ... > file`.
  let redirect: { append: boolean; target: string } | null = null;
  const redirectIndex = tokens.findIndex((token) => "op" in token && token.op !== "|");
  let commandTokens = tokens;
  if (redirectIndex !== -1) {
    const opToken = tokens[redirectIndex] as { op: ">" | ">>" };
    const targetToken = tokens[redirectIndex + 1];
    if (!targetToken || "op" in targetToken || redirectIndex + 2 !== tokens.length) {
      return {
        ...unchanged,
        stderr:
          "bash: syntax error: > / >> の後にはファイル名を1つだけ書いてください（行の最後に置きます）\n",
      };
    }
    redirect = { append: opToken.op === ">>", target: targetToken.text };
    commandTokens = tokens.slice(0, redirectIndex);
  }

  const stages: Token[][] = [[]];
  for (const token of commandTokens) {
    if ("op" in token) {
      stages.push([]);
    } else {
      stages[stages.length - 1].push(token);
    }
  }
  if (stages.some((stage) => stage.length === 0)) {
    return { ...unchanged, stderr: "bash: syntax error near unexpected token `|'\n" };
  }

  const session: Session = {
    fs: new Map(state.nodes),
    cwd: state.cwd,
    previousCwd: state.previousCwd,
    clear: false,
    redirectPath: redirect ? resolvePath(state.cwd, redirect.target) : null,
    stdoutPath: null,
  };
  const stderr: string[] = [];
  // bash opens (and with `>` empties) the target before the command runs, so `sort a > a` leaves
  // an empty file; a target it cannot open stops the line before anything runs.
  if (redirect && session.redirectPath) {
    const existing = session.fs.get(session.redirectPath);
    const opened: string[] = [];
    const content = redirect.append && existing?.type === "file" ? existing.content : "";
    if (!writeFile(session.fs, session.redirectPath, content, opened, "bash")) {
      return { ...unchanged, stderr: opened.map((message) => `${message}\n`).join("") };
    }
  }
  let stdin: string | null = null;
  for (const [index, stage] of stages.entries()) {
    // Only the last command writes to the file; an earlier one in a pipe writes to the next.
    session.stdoutPath = index === stages.length - 1 ? session.redirectPath : null;
    const words = stage.flatMap((token) =>
      "op" in token
        ? []
        : token.quoted
          ? [token.text]
          : expandGlob({ ...state, nodes: session.fs, cwd: session.cwd }, token.text)
    );
    const [name, ...args] = words;
    const io: CommandIo = { stdin, out: [], err: [] };
    runCommand(session, name, args, io);
    stderr.push(...io.err.map((message) => `${message}\n`));
    stdin = io.out.join("");
  }

  let stdout = stdin ?? "";
  if (redirect) {
    const path = session.redirectPath ?? resolvePath(state.cwd, redirect.target);
    const existing = session.fs.get(path);
    const previous = existing?.type === "file" ? existing.content : "";
    const redirectErr: string[] = [];
    writeFile(session.fs, path, previous + stdout, redirectErr, "bash");
    stderr.push(...redirectErr.map((message) => `${message}\n`));
    stdout = "";
  }

  return {
    state: { nodes: session.fs, cwd: session.cwd, previousCwd: session.previousCwd },
    stdout,
    stderr: stderr.join(""),
    clear: session.clear,
  };
}
