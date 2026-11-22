/** Result of checking one JSON / YAML file in the playground (#583). */
export type DataCheckResult =
  | { ok: true; pretty: string; summary: string }
  | { ok: false; message: string; line: number | null; column: number | null };

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `配列（要素 ${value.length} 個）`;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return `オブジェクト（キー ${Object.keys(value).length} 個）`;
  }
  return { string: "文字列", number: "数値", boolean: "真偽値" }[typeof value as string] ?? "値";
}

/** Line and column (1-based) of a character offset. */
export function lineColumnAt(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const line = before.split("\n").length;
  return { line, column: position - before.lastIndexOf("\n") };
}

/**
 * Engines word JSON.parse errors differently (V8 adds "(line 3 column 7)", Firefox "at line 3
 * column 7", Safari only a message), so the position is read from either form when present.
 */
export function checkJson(text: string): DataCheckResult {
  if (text.trim() === "") {
    return { ok: false, message: "中身が空です", line: null, column: null };
  }
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, pretty: JSON.stringify(value, null, 2), summary: describeValue(value) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lineColumn = /line (\d+) column (\d+)/.exec(message);
    if (lineColumn) {
      return { ok: false, message, line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
    }
    const position = /position (\d+)/.exec(message);
    if (position) {
      return { ok: false, message, ...lineColumnAt(text, Number(position[1])) };
    }
    return { ok: false, message, line: null, column: null };
  }
}

interface YamlError {
  reason?: string;
  message?: string;
  mark?: { line: number; column: number };
}

/**
 * js-yaml is passed in so the page loads it only when the YAML kind is opened. `load` uses the
 * default schema (no JavaScript-type tags), so a template cannot make it run code.
 */
export function checkYaml(
  yaml: { load: (text: string) => unknown },
  text: string
): DataCheckResult {
  if (text.trim() === "") {
    return { ok: false, message: "中身が空です", line: null, column: null };
  }
  try {
    const value = yaml.load(text);
    return {
      ok: true,
      pretty: JSON.stringify(value, null, 2) ?? "null",
      summary: describeValue(value),
    };
  } catch (error) {
    const yamlError = error as YamlError;
    return {
      ok: false,
      message: yamlError.reason ?? yamlError.message ?? String(error),
      line: yamlError.mark ? yamlError.mark.line + 1 : null,
      column: yamlError.mark ? yamlError.mark.column + 1 : null,
    };
  }
}
