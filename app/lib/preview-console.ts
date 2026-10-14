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

/**
 * Runs inside the preview iframe ahead of the learner's code and forwards console output and
 * uncaught errors to the parent. Kept as literal ES5 source rather than a compiled function's
 * toString(), so what ships is exactly what the vm test runs: a compiled function could pick up
 * bundler helpers (spread, async) that do not exist inside the iframe and silently kill the bridge.
 * It only ever sends: the parent never posts into the frame, so nothing secret crosses with the
 * "*" target origin the opaque-origin frame forces on us. The learner's code can replace any of
 * this, which is harmless: the parent trusts a message only by its event.source.
 * The error formatting uses a tag check rather than instanceof, which misses errors created in
 * another realm; the fallbacks cover circular objects, BigInt inside objects and a throwing
 * toString.
 */
const BRIDGE_SOURCE = `function (win, con, messageType, maxEntries, maxTextLength) {
  var sent = 0;
  var toTag = function (value) { return Object.prototype.toString.call(value); };
  var format = function (value) {
    try {
      if (typeof value === "string") return value;
      var tag = toTag(value);
      if (tag === "[object Error]" || tag === "[object DOMException]") {
        return String(value.name) + ": " + String(value.message);
      }
      if (typeof value === "object" && value !== null) {
        var json = JSON.stringify(value);
        return typeof json === "string" ? json : String(value);
      }
      return String(value);
    } catch (e) {
      try { return toTag(value); } catch (e2) { return "[unprintable]"; }
    }
  };
  var send = function (level, values) {
    if (sent >= maxEntries) return;
    sent++;
    var parts = [];
    for (var i = 0; i < values.length; i++) parts.push(format(values[i]));
    var text = parts.join(" ");
    if (text.length > maxTextLength) text = text.slice(0, maxTextLength - 1) + "…";
    try {
      win.parent.postMessage({ type: messageType, level: level, text: text }, "*");
    } catch (e) {}
  };
  var wrap = function (method, level) {
    var original = con[method];
    con[method] = function () {
      var values = Array.prototype.slice.call(arguments);
      send(level, values);
      if (typeof original === "function") original.apply(con, values);
    };
  };
  wrap("log", "log");
  wrap("info", "log");
  wrap("debug", "log");
  wrap("warn", "warn");
  wrap("error", "error");
  win.addEventListener("error", function (event) {
    send("error", [event.message || format(event.error)]);
  });
  win.addEventListener("unhandledrejection", function (event) {
    send("error", ["Uncaught (in promise)", event.reason]);
  });
}`;

// One line past the parent's cap is sent so the parent can tell the output was cut off.
export function buildPreviewConsoleBridgeScript(): string {
  return `<script>(${BRIDGE_SOURCE})(window,console,${JSON.stringify(
    PREVIEW_CONSOLE_MESSAGE_TYPE
  )},${PREVIEW_CONSOLE_MAX_ENTRIES + 1},${PREVIEW_CONSOLE_MAX_TEXT_LENGTH});</script>`;
}

// Comments and <style> bodies are skipped whole; scanning stops at the first <body> or <script>,
// because the bridge has to precede every script anyway and a "<head>" inside a script string must
// not be taken for the element (the bridge's </script> would end the learner's script early).
const HEAD_SCAN =
  /<!--[\s\S]*?-->|<style\b[^>]*>[\s\S]*?<\/style\s*>|<(head|body|script)\b[^>]*>/gi;

function findHeadEnd(html: string): number | null {
  for (const match of html.matchAll(HEAD_SCAN)) {
    const tag = match[1]?.toLowerCase();
    if (tag === "head") {
      return (match.index ?? 0) + match[0].length;
    }
    if (tag === "body" || tag === "script") {
      return null;
    }
  }
  return null;
}

/**
 * Puts the bridge before any of the learner's scripts: right after <head>, else after the doctype
 * (a script before the doctype would switch the page into quirks mode), else at the very start.
 */
export function injectPreviewConsoleBridge(html: string): string {
  const bridge = buildPreviewConsoleBridgeScript();
  const headEnd = findHeadEnd(html);
  if (headEnd !== null) {
    return html.slice(0, headEnd) + bridge + html.slice(headEnd);
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
