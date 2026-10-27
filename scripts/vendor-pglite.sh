#!/usr/bin/env bash
# Copy PGlite (PostgreSQL in WebAssembly) from node_modules to public/vendor/pglite for the in-app
# SQL runner. The files are large (about 16MB), so they are generated, not committed (.gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."
src=node_modules/@electric-sql/pglite
dest=public/vendor/pglite
mkdir -p "$dest"
cp "$src"/dist/index.js "$src"/dist/chunk-*.js "$dest"/
cp "$src"/dist/pglite.wasm "$src"/dist/pglite.data "$src"/dist/initdb.wasm "$dest"/
cp "$src"/LICENSE "$dest"/LICENSE
echo "Wrote $dest (pglite $(node -p "require('./$src/package.json').version"))"
