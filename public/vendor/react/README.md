# React in-app preview vendor libraries

Fixed versions for the sandboxed `srcDoc` iframe (issue #475). Loaded only when a React
layout preview opens — not part of the Next.js client bundle.

| File | Package | Version |
| --- | --- | --- |
| `react.production.min.js` | `react` (IIFE global `React`) | same as root `package.json` |
| `react-dom.production.min.js` | `react-dom/client` (IIFE global `ReactDOM`) | same as root `package.json` |
| `babel.min.js` | `@babel/standalone` | see `package.json` devDependency |

Licenses: MIT (see `LICENSE-*.txt`). Regenerate with `bun run vendor:react-preview`.
