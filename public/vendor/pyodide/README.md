# Pyodide (in-app Python runner)

CPython compiled to WebAssembly, used by `PythonConsole` to run Python exercises in the browser
(issue #545). Loaded only when a learner presses 実行 on a Python exercise — not part of the Next.js
client bundle.

| File | Source |
| --- | --- |
| `pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json` | `pyodide` npm package (version in `package.json`) — **generated, not committed** |
| `python-worker.js` | hand-written Web Worker that runs one program per worker (committed) |

Licenses: Pyodide is MPL-2.0 (<https://github.com/pyodide/pyodide/blob/main/LICENSE>); CPython and
its standard library are under the PSF License (<https://docs.python.org/3/license.html>).

Regenerate with `bun run vendor:pyodide` (also runs before `dev` and `build`).
