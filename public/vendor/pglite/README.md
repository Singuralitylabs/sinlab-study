# PGlite (in-app SQL runner)

PostgreSQL compiled to WebAssembly, used by `SqlConsole` to run SQL exercises in the browser
(issue #507). Loaded only when a learner presses 実行 on a SQL exercise — not part of the Next.js
client bundle.

| File | Source |
| --- | --- |
| `index.js`, `chunk-*.js`, `pglite.wasm`, `pglite.data`, `initdb.wasm` | `@electric-sql/pglite` (version in `package.json`) — **generated, not committed** |
| `sql-worker.js` | hand-written Web Worker that runs one statement at a time (committed) |
| `LICENSE` | Apache-2.0 (PGlite) |

Regenerate with `bun run vendor:pglite` (also runs before `dev` and `build`).
