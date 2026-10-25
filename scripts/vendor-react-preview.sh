#!/usr/bin/env bash
# Rebuild public/vendor/react from package.json versions (React / ReactDOM / Babel).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/vendor/react
bunx esbuild node_modules/react/index.js \
  --bundle \
  --format=iife \
  --global-name=React \
  --minify \
  --define:process.env.NODE_ENV=\"production\" \
  --footer:js='window.React=React.default||React;' \
  --outfile=public/vendor/react/react.production.min.js
bunx esbuild scripts/vendor-entries/react-dom-client.js \
  --bundle \
  --format=iife \
  --global-name=ReactDOM \
  --minify \
  --define:process.env.NODE_ENV=\"production\" \
  --alias:react=./scripts/vendor-entries/react-browser-external.js \
  --footer:js='window.ReactDOM=ReactDOM.default||ReactDOM;' \
  --outfile=public/vendor/react/react-dom.production.min.js
cp node_modules/@babel/standalone/babel.min.js public/vendor/react/babel.min.js
cp node_modules/@tailwindcss/browser/dist/index.global.js public/vendor/react/tailwind.browser.js
cp node_modules/react/LICENSE public/vendor/react/LICENSE-react.txt
cp node_modules/react-dom/LICENSE public/vendor/react/LICENSE-react-dom.txt
cp node_modules/@babel/standalone/LICENSE public/vendor/react/LICENSE-babel.txt
cp node_modules/@tailwindcss/browser/LICENSE public/vendor/react/LICENSE-tailwindcss.txt
echo "Wrote public/vendor/react (react $(node -p "require('react/package.json').version"), tailwind $(node -p "require('@tailwindcss/browser/package.json').version"), babel $(node -p "require('@babel/standalone/package.json').version"))"
