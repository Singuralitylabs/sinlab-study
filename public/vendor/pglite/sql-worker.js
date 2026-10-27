// Runs a learner's SQL on PGlite (PostgreSQL compiled to WebAssembly) inside a Web Worker, so a
// slow query can be stopped by terminating the worker instead of freezing the page. SQL cannot touch
// the page or its cookies, so unlike the JavaScript preview this needs no sandboxed iframe.
import { PGlite } from "./index.js";

const MAX_ROWS = 100;
let dbPromise = null;

function getDb() {
  dbPromise ??= PGlite.create();
  return dbPromise;
}

// Each run starts from an empty database: the exercises are scripts that run from the top.
async function reset(db) {
  await db.query("DISCARD ALL");
  await db.query("DROP SCHEMA IF EXISTS public CASCADE");
  await db.query("CREATE SCHEMA public");
}

async function runStatement(db, sql) {
  try {
    const result = await db.query(sql, [], { rowMode: "array" });
    if (result.fields.length > 0) {
      return {
        kind: "rows",
        fields: result.fields.map((field) => field.name),
        rows: result.rows.slice(0, MAX_ROWS),
        totalRows: result.rows.length,
      };
    }
    return {
      kind: "command",
      command: result.command ?? "",
      affectedRows: result.affectedRows ?? 0,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

self.onmessage = async (event) => {
  const statements = event.data?.statements;
  if (!Array.isArray(statements)) {
    return;
  }
  try {
    const db = await getDb();
    await reset(db);
    self.postMessage({ type: "ready" });
    for (let index = 0; index < statements.length; index++) {
      self.postMessage({
        type: "statement",
        index,
        result: await runStatement(db, String(statements[index])),
      });
    }
    self.postMessage({ type: "done" });
  } catch (error) {
    dbPromise = null;
    self.postMessage({
      type: "fatal",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
