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
 * realm, and prints DevTools-style ({a: 1}, [<li>], Map(1) {"k" => 1}) instead of JSON: DOM nodes,
 * errors, Map / Set and class instances have no own enumerable data and would all print as "{}".
 * One character budget is shared by the whole value and checked before each child is printed, so
 * a large or self-referencing structure (window, graphs with back references) costs about the
 * budget instead of being printed whole and then cut. Format specifiers apply only with more than
 * one argument, as in DevTools (a lone "100%%" stays as is).
 */
const BRIDGE_SOURCE = `function (win, con, messageType, maxEntries, maxTextLength) {
  var sent = 0;
  var toTag = function (value) { return Object.prototype.toString.call(value); };
  var isNode = function (value) {
    return typeof value.nodeType === "number" && typeof value.nodeName === "string";
  };
  var describeNode = function (value) {
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
  };
  var keyLabel = function (key) {
    return /^([A-Za-z_$][A-Za-z0-9_$]*|[0-9]+)$/.test(key) ? key : JSON.stringify(key);
  };
  var inspect = function (value, depth, ctx) {
    var nested = depth > 0;
    if (typeof value === "string") return nested ? JSON.stringify(value) : value;
    if (typeof value === "bigint") return String(value) + "n";
    if (typeof value === "function") return "ƒ " + (value.name || "anonymous") + "()";
    if (typeof value !== "object" || value === null) return String(value);
    var tag = toTag(value);
    if (tag === "[object Error]" || tag === "[object DOMException]") {
      return String(value.name) + ": " + String(value.message);
    }
    if (isNode(value)) return describeNode(value);
    if (tag === "[object Date]" || tag === "[object RegExp]") return String(value);
    if (tag === "[object Window]" || value.window === value) return "Window";
    if (ctx.seen.indexOf(value) !== -1) return "[Circular]";
    var proto = Object.getPrototypeOf(value);
    var isArray = Array.isArray(value);
    var isMap = tag === "[object Map]";
    var isSet = tag === "[object Set]";
    var isList = !isArray && typeof value.length === "number" && /(List|Collection)\\]$/.test(tag);
    var label = "";
    if (isMap || isSet) label = tag.slice(8, -1) + "(" + value.size + ") ";
    else if (isList) label = tag.slice(8, -1) + "(" + value.length + ") ";
    else if (!isArray && proto !== Object.prototype && proto !== null) {
      var name = proto && proto.constructor && proto.constructor.name;
      if (name) label = name + " ";
    }
    if (depth > 2) {
      if (isArray) return "Array(" + value.length + ")";
      return label ? label.slice(0, -1) : "{…}";
    }
    var parts = [];
    var more = false;
    var add = function (print) {
      if (ctx.left <= 0) { more = true; return false; }
      var text = print();
      ctx.left -= text.length + 2;
      parts.push(text);
      return true;
    };
    var child = function (v) { return inspect(v, depth + 1, ctx); };
    ctx.seen.push(value);
    try {
      if (isArray || isList) {
        for (var i = 0; i < value.length; i++) {
          if (!add(function () { return child(value[i]); })) break;
        }
      } else if (isMap || isSet) {
        value.forEach(function (v, k) {
          if (more) return;
          add(function () { return isMap ? child(k) + " => " + child(v) : child(v); });
        });
      } else {
        var keys = Object.keys(value);
        for (var j = 0; j < keys.length; j++) {
          if (!add(function () { return keyLabel(keys[j]) + ": " + child(value[keys[j]]); })) break;
        }
      }
    } finally {
      ctx.seen.pop();
    }
    var open = isArray || isList ? "[" : "{";
    var close = isArray || isList ? "]" : "}";
    if (more) parts.push("…");
    return label + open + parts.join(", ") + close;
  };
  var format = function (value) {
    try {
      return inspect(value, 0, { left: maxTextLength, seen: [] });
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
