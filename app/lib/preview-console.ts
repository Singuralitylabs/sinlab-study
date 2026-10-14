/** Lines kept per run; a loop that logs forever must not grow the parent's state without bound. */
export const PREVIEW_CONSOLE_MAX_ENTRIES = 200;

/** Characters per line; longer output is cut by the bridge, and anything longer is rejected. */
export const PREVIEW_CONSOLE_MAX_TEXT_LENGTH = 1000;

export const PREVIEW_CONSOLE_MESSAGE_TYPE = "sinlab-preview-console";

export const PREVIEW_CONSOLE_LEVELS = ["log", "warn", "error"] as const;
export type PreviewConsoleLevel = (typeof PREVIEW_CONSOLE_LEVELS)[number];

export interface PreviewConsoleEntry {
  level: PreviewConsoleLevel;
  text: string;
}

interface BridgeWindow {
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
  addEventListener: (type: string, listener: (event: never) => void) => void;
}

interface BridgeConsole {
  [method: string]: unknown;
}

/**
 * Runs inside the preview iframe ahead of the learner's code and forwards console output and
 * uncaught errors to the parent. Inlined via toString(), so it must not reference outer symbols.
 * It only ever sends: the parent never posts into the frame, so nothing secret crosses with the
 * "*" target origin the opaque-origin frame forces on us. The learner's code can replace any of
 * this, which is harmless: the parent trusts a message only by its event.source.
 */
export function previewConsoleBridge(
  win: BridgeWindow,
  con: BridgeConsole,
  messageType: string,
  maxEntries: number,
  maxTextLength: number
): void {
  let sent = 0;

  const format = (value: unknown): string => {
    try {
      if (typeof value === "string") {
        return value;
      }
      // A tag check rather than instanceof, which misses errors created in another realm.
      const tag = Object.prototype.toString.call(value);
      if (tag === "[object Error]" || tag === "[object DOMException]") {
        const error = value as { name: unknown; message: unknown };
        return `${String(error.name)}: ${String(error.message)}`;
      }
      if (typeof value === "object" && value !== null) {
        const json = JSON.stringify(value);
        return typeof json === "string" ? json : String(value);
      }
      return String(value);
    } catch {
      // Circular objects, BigInt inside objects, a throwing toString: still show something.
      try {
        return Object.prototype.toString.call(value);
      } catch {
        return "[unprintable]";
      }
    }
  };

  const send = (level: string, values: unknown[]): void => {
    if (sent >= maxEntries) {
      return;
    }
    sent++;
    let text = values.map(format).join(" ");
    if (text.length > maxTextLength) {
      text = `${text.slice(0, maxTextLength - 1)}…`;
    }
    try {
      win.parent.postMessage({ type: messageType, level, text }, "*");
    } catch {
      // The parent may be gone (page navigated away); the learner's code must keep running.
    }
  };

  const methods: [string, string][] = [
    ["log", "log"],
    ["info", "log"],
    ["debug", "log"],
    ["warn", "warn"],
    ["error", "error"],
  ];
  for (const [method, level] of methods) {
    const original = con[method];
    con[method] = (...values: unknown[]) => {
      send(level, values);
      if (typeof original === "function") {
        original.apply(con, values);
      }
    };
  }

  win.addEventListener("error", (event: { message?: string; error?: unknown }) => {
    send("error", [event.message || format(event.error)]);
  });
  win.addEventListener("unhandledrejection", (event: { reason?: unknown }) => {
    send("error", ["Uncaught (in promise)", event.reason]);
  });
}

// One line past the parent's cap is sent so the parent can tell the output was cut off.
export function buildPreviewConsoleBridgeScript(): string {
  return `<script>(${previewConsoleBridge.toString()})(window,console,${JSON.stringify(
    PREVIEW_CONSOLE_MESSAGE_TYPE
  )},${PREVIEW_CONSOLE_MAX_ENTRIES + 1},${PREVIEW_CONSOLE_MAX_TEXT_LENGTH});</script>`;
}

/**
 * Puts the bridge before any of the learner's scripts: right after <head>, else after the doctype
 * (a script before the doctype would switch the page into quirks mode), else at the very start.
 */
export function injectPreviewConsoleBridge(html: string): string {
  const bridge = buildPreviewConsoleBridgeScript();
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + bridge + html.slice(at);
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype[0].length;
    return html.slice(0, at) + bridge + html.slice(at);
  }
  return bridge + html;
}

/** Shape check for a message already known to come from our frame; anything else is dropped. */
export function parsePreviewConsoleMessage(data: unknown): PreviewConsoleEntry | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { type, level, text } = data as Record<string, unknown>;
  if (
    type !== PREVIEW_CONSOLE_MESSAGE_TYPE ||
    !PREVIEW_CONSOLE_LEVELS.includes(level as PreviewConsoleLevel) ||
    typeof text !== "string" ||
    text.length > PREVIEW_CONSOLE_MAX_TEXT_LENGTH
  ) {
    return null;
  }
  return { level: level as PreviewConsoleLevel, text };
}

/**
 * Only our own iframe's window counts as the sender. Any page or frame can post a well-formed
 * message (the shape is public in this script), so the source is what rules out spoofing; a
 * reloaded iframe gets a new element, so its old window is no longer accepted either.
 */
export function acceptPreviewConsoleMessage(
  event: { source: unknown; data: unknown },
  frameWindow: unknown
): PreviewConsoleEntry | null {
  if (frameWindow === null || frameWindow === undefined || event.source !== frameWindow) {
    return null;
  }
  return parsePreviewConsoleMessage(event.data);
}
