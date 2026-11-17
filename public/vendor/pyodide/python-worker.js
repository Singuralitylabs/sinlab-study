// Runs a learner's Python on Pyodide (CPython compiled to WebAssembly) inside a Web Worker, so a
// program that never ends can be stopped by terminating the worker instead of freezing the page.
// Python here cannot touch the page or its cookies, so unlike the JavaScript preview this needs no
// sandboxed iframe.
//
// One worker runs one program. The page terminates it afterwards and starts a fresh one, so nothing a
// run defines, imports, patches or writes to the file system can reach the next run.
import { loadPyodide } from "./pyodide.mjs";

// Same number as PYTHON_MAX_OUTPUT_LENGTH in app/lib/python-runner.ts.
const MAX_OUTPUT_LENGTH = 100_000;
const INDEX_URL = new URL("./", import.meta.url).href;

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
import builtins, os, runpy, sys, traceback

def _sinlab_no_input(*args, **kwargs):
    raise RuntimeError("この実行環境では input() は使えません。値はコードの中に書いてください")

def _sinlab_run(entry, names):
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
        sys.stdout.flush()
        sys.stderr.flush()

_sinlab_run
`;

let started = false;
let sent = 0;
let truncated = false;

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

function isValidRequest(data) {
  return (
    data &&
    typeof data.entry === "string" &&
    Array.isArray(data.files) &&
    data.files.length > 0 &&
    data.files.every(
      (file) =>
        file &&
        typeof file.filename === "string" &&
        typeof file.content === "string" &&
        file.filename !== "" &&
        file.filename !== "." &&
        file.filename !== ".." &&
        !/[/\\\0]/.test(file.filename)
    ) &&
    data.files.some((file) => file.filename === data.entry)
  );
}

self.onmessage = async (event) => {
  if (started || !isValidRequest(event.data)) {
    return;
  }
  started = true;
  const { entry, files } = event.data;
  let pyodide;
  try {
    pyodide = await pyodidePromise;
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: `Python の実行環境を読み込めませんでした（${error instanceof Error ? error.message : String(error)}）`,
    });
    return;
  }
  try {
    for (const file of files) {
      pyodide.FS.writeFile(file.filename, file.content, { encoding: "utf8" });
    }
    pyodide.setStdout(streamTo("stdout"));
    pyodide.setStderr(streamTo("stderr"));
    const run = pyodide.runPython(HARNESS);
    self.postMessage({ type: "ready" });
    run(
      entry,
      files.map((file) => file.filename)
    );
    self.postMessage({ type: "done" });
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
