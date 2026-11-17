// Runs a learner's Python on Pyodide (CPython compiled to WebAssembly) inside a Web Worker, so a
// program that never ends can be stopped by terminating the worker instead of freezing the page.
// Python here cannot touch the page or its cookies, so unlike the JavaScript preview this needs no
// sandboxed iframe.
//
// One worker runs one program. The page terminates it afterwards and starts a fresh one, so nothing a
// run defines, imports, patches or writes to the file system can reach the next run.
import { loadPyodide } from "./pyodide.mjs";

// Same numbers as PYTHON_MAX_OUTPUT_LENGTH / PYTHON_MAX_FIGURES / PYTHON_MAX_FIGURE_BYTES in
// app/lib/python-runner.ts.
const MAX_OUTPUT_LENGTH = 100_000;
const MAX_FIGURES = 20;
const MAX_FIGURE_BYTES = 5_000_000;
const INDEX_URL = new URL("./", import.meta.url).href;
const FONT_FILE = "NotoSansJP-Regular.ttf";
const FONT_DIR = "/usr/share/fonts/sinlab";

// Import name -> Pyodide package, for the packages scripts/vendor-pyodide.sh copies (with their
// dependencies). Anything else is not on this server, so it is not requested: the import fails with
// ModuleNotFoundError, as it would on a computer without the package.
const PACKAGE_BY_IMPORT = {
  numpy: "numpy",
  pandas: "pandas",
  matplotlib: "matplotlib",
  mpl_toolkits: "matplotlib",
  pylab: "matplotlib",
  bs4: "beautifulsoup4",
  soupsieve: "soupsieve",
  PIL: "pillow",
  dateutil: "python-dateutil",
  pytz: "pytz",
  six: "six",
  contourpy: "contourpy",
  cycler: "cycler",
  fontTools: "fonttools",
  kiwisolver: "kiwisolver",
  packaging: "packaging",
  pyparsing: "pyparsing",
  typing_extensions: "typing-extensions",
};

// Loading starts as soon as the worker exists, so a worker the page starts ahead of time is ready by
// the time the learner presses 実行. Packages are only ever read from this directory: there is no
// micropip and no CDN fallback.
const pyodidePromise = loadPyodide({
  indexURL: INDEX_URL,
  packageBaseUrl: INDEX_URL,
  stdout: () => {},
  stderr: () => {},
});
// A failed load is reported when a run asks for it; this only keeps it from being an unhandled
// rejection while the worker waits.
pyodidePromise.catch(() => {});

// Formats the traceback the way `python main.py` would: the frames of the harness and runpy that sit
// above the learner's file are dropped, everything from the first learner frame down is kept, and the
// learner's own files are named without the worker's directory.
const HARNESS = `
import builtins, io, os, runpy, sys, traceback, types

def _sinlab_setup_pandas():
    import pandas as pd
    # Japanese is full width; without this the columns of print(df) do not line up.
    pd.set_option("display.unicode.east_asian_width", True)

# Font names the course and common tutorials set for Japanese. They are not installed here, so they
# all point at the bundled Noto Sans JP; without this, setting one shows □ and a findfont warning.
_SINLAB_JP_FONT_ALIASES = [
    "Noto Sans JP", "Meiryo", "Yu Gothic", "MS Gothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
    "Hiragino Maru Gothic Pro", "IPAexGothic", "IPAGothic", "Noto Sans CJK JP", "BIZ UDGothic",
    "TakaoGothic",
]

def _sinlab_setup_matplotlib(font_path, send_figure):
    import matplotlib
    from matplotlib import font_manager
    for name in _SINLAB_JP_FONT_ALIASES:
        font_manager.fontManager.ttflist.append(font_manager.FontEntry(
            fname=font_path, name=name, style="normal", variant="normal", weight=400,
            stretch="normal", size="scalable"))
    matplotlib.rcParams["font.sans-serif"] = ["Noto Sans JP", "DejaVu Sans"]
    # This Matplotlib build warns from its own C++ text drawing on savefig; the learner's code is
    # not the cause and cannot fix it.
    import warnings
    warnings.filterwarnings(
        "ignore", message=r"The [xy] parameter as float was deprecated",
        category=matplotlib.MatplotlibDeprecationWarning)

    sent = [0]
    def flush_figures():
        pyplot = sys.modules.get("matplotlib.pyplot")
        if pyplot is None:
            return
        for number in pyplot.get_fignums():
            buffer = io.BytesIO()
            pyplot.figure(number).savefig(buffer, format="png", bbox_inches="tight")
            sent[0] += 1
            send_figure(buffer.getvalue())
        pyplot.close("all")

    # plt.show() draws each open figure as a PNG under the output (trimmed like a notebook does, so
    # rotated tick labels are not cut off), then closes it (like a window
    # being closed), so savefig after show saves an empty figure here too.
    backend = types.ModuleType("_sinlab_backend")
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    backend.FigureCanvas = FigureCanvasAgg
    backend.show = lambda *args, **kwargs: flush_figures()
    sys.modules["_sinlab_backend"] = backend
    matplotlib.use("module://_sinlab_backend")
    return flush_figures

def _sinlab_no_input(*args, **kwargs):
    raise RuntimeError("この実行環境では input() は使えません。値はコードの中に書いてください")

def _sinlab_run(entry, names, after):
    workdir = os.getcwd()
    learner_files = {os.path.join(workdir, name) for name in names}
    builtins.input = _sinlab_no_input
    sys.argv = [entry]
    sys.path.insert(0, workdir)
    try:
        runpy.run_path(entry, run_name="__main__")
    except SystemExit as exc:
        code = exc.code
        if code is not None and not isinstance(code, int):
            print(code, file=sys.stderr)
    except BaseException as exc:
        report = traceback.TracebackException.from_exception(exc)
        frames = list(report.stack)
        first = next(
            (i for i, frame in enumerate(frames)
             if os.path.join(workdir, frame.filename) in learner_files),
            len(frames),
        )
        kept = []
        for frame in frames[first:]:
            # "<exec>" is this harness (the input() stand-in); a learner never wrote it.
            if frame.filename == "<exec>":
                continue
            path = os.path.join(workdir, frame.filename)
            if path in learner_files:
                frame.filename = os.path.relpath(path, workdir)
            kept.append(frame)
        report.stack = traceback.StackSummary.from_list(kept)
        sys.stderr.write("".join(report.format()))
    finally:
        # Figures still open at the end are shown too (most scripts end with plt.show(), but a
        # learner may only call savefig).
        if after is not None:
            try:
                after()
            except Exception:
                traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()

`;

let started = false;
let sent = 0;
let truncated = false;
let figures = 0;
let packagesChain = Promise.resolve();
const loadedPackages = new Set();
// Python globals holding the harness functions, and the figure flush once matplotlib is set up.
let harness = null;
let pandasReady = false;
let flushFigures;

function send(stream, text) {
  if (truncated || text === "") {
    return;
  }
  const room = MAX_OUTPUT_LENGTH - sent;
  const kept = text.length > room ? text.slice(0, room) : text;
  if (kept !== "") {
    sent += kept.length;
    self.postMessage({ type: "output", stream, text: kept });
  }
  if (kept.length < text.length) {
    truncated = true;
    self.postMessage({ type: "truncated" });
  }
}

// Raw writes keep print(..., end="") and partial lines exactly as Python wrote them. Each write is
// posted at once: a program that prints and then loops forever still shows what it printed before
// the page stops it.
function streamTo(stream) {
  const decoder = new TextDecoder();
  return {
    write(bytes) {
      send(stream, decoder.decode(bytes, { stream: true }));
      return bytes.length;
    },
  };
}

function sendFigure(data) {
  const png = new Uint8Array(data.toJs ? data.toJs() : data);
  data.destroy?.();
  if (figures >= MAX_FIGURES || png.byteLength > MAX_FIGURE_BYTES) {
    figures = MAX_FIGURES;
    self.postMessage({ type: "figure-skipped" });
    return;
  }
  figures++;
  self.postMessage({ type: "figure", png }, [png.buffer]);
}

function isValidFiles(files) {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    files.every(
      (file) =>
        file &&
        typeof file.filename === "string" &&
        typeof file.content === "string" &&
        file.filename !== "" &&
        file.filename !== "." &&
        file.filename !== ".." &&
        !/[/\\\0]/.test(file.filename)
    )
  );
}

function packagesFor(pyodide, files) {
  const findImports = pyodide.pyimport("pyodide.code").find_imports;
  const names = new Set();
  for (const file of files) {
    const imports = findImports(file.content);
    for (const name of imports.toJs()) {
      if (Object.hasOwn(PACKAGE_BY_IMPORT, name)) {
        names.add(PACKAGE_BY_IMPORT[name]);
      }
    }
    imports.destroy();
  }
  findImports.destroy();
  return [...names].sort();
}

// Imports pandas / pyplot ahead of the program (they take seconds in WebAssembly), so a prepared
// worker has done it before 実行. No learner code has run yet, so nothing of a previous run is kept.
function warmUp(pyodide, names) {
  harness ??= pyodide.toPy({});
  if (!harness.has("_sinlab_run")) {
    pyodide.runPython(HARNESS, { globals: harness });
  }
  if (names.includes("pandas") && !pandasReady) {
    harness.get("_sinlab_setup_pandas")();
    pandasReady = true;
  }
  if (names.includes("matplotlib") && !flushFigures) {
    flushFigures = harness.get("_sinlab_setup_matplotlib")(`${FONT_DIR}/${FONT_FILE}`, sendFigure);
    pyodide.runPython("import matplotlib.pyplot");
  }
}

// Loads what the files import, on top of what is already loaded. The page also sends the last run's
// files to the worker it starts ahead of time, so rerunning an exercise does not wait for pandas
// again; an edit that adds an import loads the rest when 実行 is pressed. Calls run one after another.
function loadPackagesFor(files) {
  const next = packagesChain.then(async () => {
    const pyodide = await pyodidePromise;
    const names = packagesFor(pyodide, files);
    const missing = names.filter((name) => !loadedPackages.has(name));
    if (missing.length === 0) {
      warmUp(pyodide, names);
      return names;
    }
    self.postMessage({ type: "packages", names: missing });
    const errors = [];
    await pyodide.loadPackage(missing, {
      messageCallback: () => {},
      errorCallback: (message) => errors.push(message),
    });
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
    if (missing.includes("matplotlib")) {
      const response = await fetch(new URL(FONT_FILE, INDEX_URL));
      if (!response.ok) {
        throw new Error(`${FONT_FILE}: ${response.status}`);
      }
      pyodide.FS.mkdirTree(FONT_DIR);
      pyodide.FS.writeFile(`${FONT_DIR}/${FONT_FILE}`, new Uint8Array(await response.arrayBuffer()));
    }
    for (const name of missing) {
      loadedPackages.add(name);
    }
    warmUp(pyodide, names);
    return names;
  });
  packagesChain = next.catch(() => {});
  return next;
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

async function run({ entry, files }) {
  let pyodide;
  try {
    pyodide = await pyodidePromise;
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: `Python の実行環境を読み込めませんでした（${errorText(error)}）`,
    });
    return;
  }
  try {
    await loadPackagesFor(files);
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: `パッケージを読み込めませんでした。通信を確認して、もう一度試してください（${errorText(error)}）`,
    });
    return;
  }
  try {
    for (const file of files) {
      pyodide.FS.writeFile(file.filename, file.content, { encoding: "utf8" });
    }
    pyodide.setStdout(streamTo("stdout"));
    pyodide.setStderr(streamTo("stderr"));
    self.postMessage({ type: "ready" });
    harness.get("_sinlab_run")(
      entry,
      files.map((file) => file.filename),
      flushFigures
    );
    self.postMessage({ type: "done" });
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: `Python の実行環境でエラーが起きました（${errorText(error)}）`,
    });
  }
}

self.onmessage = (event) => {
  const data = event.data;
  if (started || !data || !isValidFiles(data.files)) {
    return;
  }
  if (data.type === "prepare") {
    loadPackagesFor(data.files);
  } else if (
    data.type === "run" &&
    typeof data.entry === "string" &&
    data.files.some((file) => file.filename === data.entry)
  ) {
    started = true;
    run(data);
  }
};
