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
 * Formatting uses tag checks rather than instanceof, which misses values created in another
 * realm. JSON is used only for plain objects and arrays, and the replacer summarises any other
 * object nested inside them: DOM nodes, errors, Map / Set and class instances have no own
 * enumerable data and would all print as a misleading "{}" (a NodeList of <li> included). The
 * depth cap keeps instances that point at each other from recursing without end. Format
 * specifiers apply only with more than one argument, as in DevTools (a lone "100%%" stays as is).
 * The fallbacks cover circular objects, BigInt inside objects and a throwing toString.
 */
const BRIDGE_SOURCE = `function (win, con, messageType, maxEntries, maxTextLength) {
  var sent = 0;
  var toTag = function (value) { return Object.prototype.toString.call(value); };
  var isNode = function (value) {
    return typeof value.nodeType === "number" && typeof value.nodeName === "string";
  };
  var isPlain = function (value) {
    var proto = Object.getPrototypeOf(value);
    return Array.isArray(value) || proto === Object.prototype || proto === null;
  };
  var json = function (value, depth) {
    var text = JSON.stringify(value, function (key, v) {
      if (key === "") return v;
      var nested = typeof v === "object" && v !== null && (isNode(v) || !isPlain(v));
      if (typeof v === "function" || nested) {
        return format(v, depth + 1);
      }
      return v;
    });
    return typeof text === "string" ? text : String(value);
  };
  var collect = function (iterable, isMap) {
    var items = [];
    iterable.forEach(function (v, k) { items.push(isMap ? [k, v] : v); });
    return items;
  };
  var format = function (value, depth) {
    depth = depth || 0;
    try {
      if (typeof value === "string") return value;
      if (typeof value === "function") return "ƒ " + (value.name || "anonymous") + "()";
      if (typeof value !== "object" || value === null) return String(value);
      var tag = toTag(value);
      if (tag === "[object Error]" || tag === "[object DOMException]") {
        return String(value.name) + ": " + String(value.message);
      }
      if (isNode(value)) {
        if (value.nodeType === 1) {
          var el = "<" + String(value.tagName).toLowerCase();
          if (value.id) el += ' id="' + value.id + '"';
          if (typeof value.className === "string" && value.className) {
            el += ' class="' + value.className + '"';
          }
          return el + ">";
        }
        if (value.nodeType === 3) return '#text "' + value.data + '"';
        return value.nodeName;
      }
      if (tag === "[object Date]" || tag === "[object RegExp]") return String(value);
      if (depth > 2) return tag;
      if (tag === "[object Map]" || tag === "[object Set]") {
        var items = collect(value, tag === "[object Map]");
        return tag.slice(8, -1) + "(" + value.size + ") " + json(items, depth);
      }
      if (isPlain(value)) return json(value, depth);
      var proto = Object.getPrototypeOf(value);
      var name = proto && proto.constructor && proto.constructor.name;
      return (name ? name + " " : "") + json(value, depth);
    } catch (e) {
      try { return toTag(value); } catch (e2) { return "[unprintable]"; }
    }
  };
  var render = function (values) {
    var rest = values.slice();
    var head = "";
    if (rest.length > 1 && typeof rest[0] === "string" && rest[0].indexOf("%") !== -1) {
      head = rest.shift().replace(/%[sdifoOc%]/g, function (spec) {
        if (spec === "%%") return "%";
        if (rest.length === 0) return spec;
        var arg = rest.shift();
        if (spec === "%c") return "";
        if (spec === "%d" || spec === "%i" || spec === "%f") {
          try {
            return String(spec === "%f" ? parseFloat(arg) : parseInt(arg, 10));
          } catch (e) {
            return "NaN";
          }
        }
        return format(arg);
      });
    }
    var parts = head === "" ? [] : [head];
    for (var i = 0; i < rest.length; i++) parts.push(format(rest[i]));
    return parts.join(" ");
  };
  var send = function (level, values) {
    if (sent >= maxEntries) return;
    sent++;
    var text;
    try { text = render(values); } catch (e) { text = "[unprintable]"; }
    if (text.length > maxTextLength) text = text.slice(0, maxTextLength - 1) + "…";
    try {
      win.parent.postMessage({ type: messageType, level: level, text: text }, "*");
    } catch (e) {}
  };
  var wrap = function (method, level) {
    var original = con[method];
    con[method] = function () {
      var values = Array.prototype.slice.call(arguments);
      try { send(level, values); } catch (e) {}
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
