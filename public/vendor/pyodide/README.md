# Pyodide (in-app Python runner)

CPython compiled to WebAssembly, used by `PythonConsole` to run Python exercises in the browser
(issue #545). Loaded only when a learner presses 実行 on a Python exercise — not part of the Next.js
client bundle.

| File | Source |
| --- | --- |
| `pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json` | `pyodide` npm package (version in `package.json`) — **generated, not committed** |
| `*.whl` (NumPy, pandas, matplotlib, Beautiful Soup and their dependencies) | release archive of the same Pyodide version, SHA-256 pinned in `scripts/vendor-pyodide.sh` — **generated, not committed** |
| `NotoSansJP-Regular.ttf`, `LICENSE-NotoSansJP.txt` | `@expo-google-fonts/noto-sans-jp` (version in `package.json`), for Japanese text in matplotlib — **generated, not committed** |
| `python-worker.js` | hand-written Web Worker that runs one program per worker (committed) |

Licenses: Pyodide is MPL-2.0 (<https://github.com/pyodide/pyodide/blob/main/LICENSE>); CPython and
its standard library are under the PSF License (<https://docs.python.org/3/license.html>). Each wheel
carries its own license in its `.dist-info` (NumPy, pandas, matplotlib, Beautiful Soup and the rest
are BSD / MIT / PSF-style). Noto Sans JP is under the SIL Open Font License 1.1.

Regenerate with `bun run vendor:pyodide` (also runs before `dev` and `build`). The first run downloads
the release archive (about 340MB) and keeps only the wheels in `node_modules/.cache/pyodide-packages/`.
