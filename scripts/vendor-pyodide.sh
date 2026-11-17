#!/usr/bin/env bash
# Copy Pyodide (CPython compiled to WebAssembly) to public/vendor/pyodide for the in-app Python
# runner. The files are large (about 37MB), so they are generated, not committed (.gitignore).
#
# The npm package holds only the interpreter and the standard library. The packages the data
# analysis course uses (NumPy, pandas, matplotlib, Beautiful Soup and what they depend on) come from
# the release archive of the same version, whose SHA-256 is pinned below; the archive is about 340MB,
# so only the needed wheels are kept, under node_modules/.cache (kept between Vercel builds).
set -euo pipefail
cd "$(dirname "$0")/.."
src=node_modules/pyodide
dest=public/vendor/pyodide
version=$(node -p "require('./$src/package.json').version")
# Must match the npm version: pyodide-lock.json (copied from npm) names the wheels and their hashes.
archive_version=314.0.8
archive_sha256=ce4ac9b450c22b1cee278ddda7c12ee5b83acb1f967d0675fff189be6739e574
# Top-level packages; their dependencies are added from pyodide-lock.json. Keep in step with
# PACKAGE_BY_IMPORT in public/vendor/pyodide/python-worker.js.
packages="numpy pandas matplotlib beautifulsoup4"

if [ "$version" != "$archive_version" ]; then
  echo "pyodide $version in package.json, but the package archive is pinned to $archive_version." >&2
  echo "Update archive_version and archive_sha256 in $0." >&2
  exit 1
fi

mkdir -p "$dest"
cp "$src"/pyodide.mjs "$src"/pyodide.asm.mjs "$src"/pyodide.asm.wasm "$src"/python_stdlib.zip \
  "$src"/pyodide-lock.json "$dest"/

# Wheel file names (with dependencies) and their SHA-256, one "name hash" per line.
wheels=$(node -e '
const lock = require("./" + process.argv[1] + "/pyodide-lock.json").packages;
const seen = new Set();
const visit = (name) => {
  if (seen.has(name)) return;
  if (!lock[name]) throw new Error(`${name} is not in pyodide-lock.json`);
  seen.add(name);
  lock[name].depends.forEach(visit);
};
process.argv.slice(2).forEach(visit);
for (const name of [...seen].sort()) console.log(lock[name].file_name, lock[name].sha256);
' "$src" $packages)

# sha256sum is not on every Mac, so hashes are checked with Node. Prints nothing; exit 1 on mismatch.
sha256_matches() {
  node -e '
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const [dir, list] = process.argv.slice(1);
for (const line of list.split("\n").filter(Boolean)) {
  const [file, sha] = line.split(" ");
  let actual = "";
  try {
    actual = createHash("sha256").update(readFileSync(dir ? `${dir}/${file}` : file)).digest("hex");
  } catch {}
  if (actual !== sha) process.exit(1);
}
' "$1" "$2"
}

verify() {
  sha256_matches "$1" "$wheels"
}

cache=node_modules/.cache/pyodide-packages/$archive_version
if [ ! -d "$cache" ] || ! verify "$cache"; then
  rm -rf "$cache"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  url="https://github.com/pyodide/pyodide/releases/download/$archive_version/pyodide-$archive_version.tar.bz2"
  echo "Downloading $url (about 340MB, once; then cached in $cache)"
  curl -fsSL --retry 4 --retry-delay 5 -o "$tmp/pyodide.tar.bz2" "$url"
  if ! sha256_matches "" "$tmp/pyodide.tar.bz2 $archive_sha256"; then
    echo "The downloaded archive does not match the pinned SHA-256" >&2
    exit 1
  fi
  mkdir -p "$tmp/out"
  # shellcheck disable=SC2046
  tar -xjf "$tmp/pyodide.tar.bz2" -C "$tmp/out" --strip-components=1 \
    $(echo "$wheels" | awk '{ print "pyodide/" $1 }')
  if ! verify "$tmp/out"; then
    echo "A wheel in the archive does not match pyodide-lock.json" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$cache")"
  mv "$tmp/out" "$cache"
fi
echo "$wheels" | while read -r file _; do
  cp "$cache/$file" "$dest/$file"
done

# Japanese glyphs for matplotlib (axis labels and titles). OFL-1.1.
font=node_modules/@expo-google-fonts/noto-sans-jp
cp "$font"/400Regular/NotoSansJP_400Regular.ttf "$dest"/NotoSansJP-Regular.ttf
cp "$font"/LICENSE_FONT "$dest"/LICENSE-NotoSansJP.txt

echo "Wrote $dest (pyodide $version; $(echo "$wheels" | wc -l) wheels)"
