#!/usr/bin/env bash
# Copy Pyodide (CPython compiled to WebAssembly) from node_modules to public/vendor/pyodide for the
# in-app Python runner. The files are large (about 13MB), so they are generated, not committed
# (.gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."
src=node_modules/pyodide
dest=public/vendor/pyodide
mkdir -p "$dest"
cp "$src"/pyodide.mjs "$src"/pyodide.asm.mjs "$src"/pyodide.asm.wasm "$src"/python_stdlib.zip \
  "$src"/pyodide-lock.json "$dest"/
echo "Wrote $dest (pyodide $(node -p "require('./$src/package.json').version"))"
