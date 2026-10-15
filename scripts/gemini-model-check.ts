/**
 * Compares Gemini models.list against the registered models in app/constants/gemini.ts (#369).
 *
 * Usage:
 *   GEMINI_MODEL_CHECK_API_KEY=... bun scripts/gemini-model-check.ts [--json]
 *   bun scripts/gemini-model-check.ts --available gemini-3.8-flash,gemini-4.0-flash [--json]
 *   bun scripts/gemini-model-check.ts --apply-update gemini-4.0-flash [--missing-registered a,b]
 *
 * Never logs the API key. Does not run grading dry-run (that stays a human / local step).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GEMINI_REGISTERED_MODELS } from "../app/constants/gemini";

const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const CONSTANTS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../app/constants/gemini.ts"
);
const API_KEY_ENV = "GEMINI_MODEL_CHECK_API_KEY";

/** Unstable / alias markers that must never become an auto-update target. */
const UNSTABLE_MARKERS = /(?:^|-)(preview|exp|experimental|latest)(?:-|$)/i;

export type VersionParts = number[];

export type RegisteredModels = {
  primary: string;
  alternate: string;
};

export type ModelCheckPlan = {
  newerStableFlash: string | null;
  missingRegistered: string[];
  registered: RegisteredModels;
};

export type ConstantsUpdatePlan = {
  newPrimary: string;
  newAlternate: string;
  primaryWasMissing: boolean;
};

export function normalizeModelId(name: string): string {
  return name.replace(/^models\//, "").trim();
}

/**
 * Stable Flash family used for AI review: `gemini-<version>-flash` with no extra suffixes
 * (excludes flash-lite, live, tts, image, preview, exp, and -latest aliases).
 */
export function isStableFlashModel(modelId: string): boolean {
  const id = normalizeModelId(modelId);
  if (UNSTABLE_MARKERS.test(id)) {
    return false;
  }
  return /^gemini-\d+(?:\.\d+)*-flash$/.test(id);
}

export function parseFlashVersion(modelId: string): VersionParts | null {
  const id = normalizeModelId(modelId);
  if (!isStableFlashModel(id)) {
    return null;
  }
  const match = id.match(/^gemini-(\d+(?:\.\d+)*)-flash$/);
  if (!match) {
    return null;
  }
  return match[1].split(".").map((part) => Number(part));
}

export function compareVersions(a: VersionParts, b: VersionParts): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
}

/** Newest stable Flash strictly newer than the current primary, or null. */
export function findNewerStableFlash(
  availableModelIds: readonly string[],
  currentPrimary: string
): string | null {
  const currentVersion = parseFlashVersion(currentPrimary);
  if (!currentVersion) {
    return null;
  }

  let best: { id: string; version: VersionParts } | null = null;
  for (const raw of availableModelIds) {
    const id = normalizeModelId(raw);
    const version = parseFlashVersion(id);
    if (!version || compareVersions(version, currentVersion) <= 0) {
      continue;
    }
    if (!best || compareVersions(version, best.version) > 0) {
      best = { id, version };
    }
  }
  return best?.id ?? null;
}

export function findMissingRegisteredModels(
  availableModelIds: readonly string[],
  registered: readonly string[]
): string[] {
  const available = new Set(availableModelIds.map(normalizeModelId));
  return registered.map(normalizeModelId).filter((id) => id.length > 0 && !available.has(id));
}

/** Derive primary/alternate from the registered list (primary first). */
export function registeredModelsFromList(
  registeredList: readonly string[] = GEMINI_REGISTERED_MODELS
): RegisteredModels {
  const primary = registeredList[0];
  const alternate = registeredList[1];
  if (!primary || !alternate) {
    throw new Error("Registered model list must include primary and alternate");
  }
  return { primary, alternate };
}

export function planModelCheck(
  availableModelIds: readonly string[],
  registeredList: readonly string[] = GEMINI_REGISTERED_MODELS
): ModelCheckPlan {
  const registered = registeredModelsFromList(registeredList);
  return {
    newerStableFlash: findNewerStableFlash(availableModelIds, registered.primary),
    missingRegistered: findMissingRegisteredModels(availableModelIds, registeredList),
    registered,
  };
}

/**
 * Choose the alternate for an auto-update. Never promote a primary that is already missing from
 * models.list into GEMINI_ALTERNATE_MODEL_NAME (#368 fallback).
 */
export function planConstantsUpdate(
  current: RegisteredModels,
  newPrimary: string,
  missingRegistered: readonly string[] = []
): ConstantsUpdatePlan {
  const missing = new Set(missingRegistered.map(normalizeModelId));
  const primaryWasMissing = missing.has(normalizeModelId(current.primary));
  return {
    newPrimary: normalizeModelId(newPrimary),
    newAlternate: primaryWasMissing ? current.alternate : current.primary,
    primaryWasMissing,
  };
}

export function readRegisteredModelsFromSource(
  source: string = readFileSync(CONSTANTS_PATH, "utf8")
): RegisteredModels {
  const primary = extractConstString(source, "GEMINI_MODEL_NAME");
  const alternate = extractConstString(source, "GEMINI_ALTERNATE_MODEL_NAME");
  if (!primary || !alternate) {
    throw new Error(
      "Could not parse GEMINI_MODEL_NAME / GEMINI_ALTERNATE_MODEL_NAME from gemini.ts"
    );
  }
  return { primary, alternate };
}

function extractConstString(source: string, name: string): string | null {
  const match = source.match(new RegExp(`export const ${name} = "([^"]+)"`));
  return match?.[1] ?? null;
}

/** Rewrite primary/alternate string literals for an auto-update PR. */
export function applyModelConstantsUpdate(
  source: string,
  newPrimary: string,
  newAlternate: string
): string {
  if (!isStableFlashModel(newPrimary) || !isStableFlashModel(newAlternate)) {
    throw new Error("Refusing to write a non-stable Flash model id into gemini.ts");
  }
  let next = source.replace(
    /export const GEMINI_MODEL_NAME = "[^"]+"/,
    `export const GEMINI_MODEL_NAME = "${newPrimary}"`
  );
  next = next.replace(
    /export const GEMINI_ALTERNATE_MODEL_NAME = "[^"]+"/,
    `export const GEMINI_ALTERNATE_MODEL_NAME = "${newAlternate}"`
  );
  if (
    !next.includes(`GEMINI_MODEL_NAME = "${newPrimary}"`) ||
    !next.includes(`GEMINI_ALTERNATE_MODEL_NAME = "${newAlternate}"`)
  ) {
    throw new Error("Failed to rewrite model constants in gemini.ts");
  }
  return next;
}

type ListModelsResponse = {
  models?: Array<{ name?: string }>;
  nextPageToken?: string;
};

/** Fetch all model resource names via models.list (key sent in header, never logged). */
export async function fetchGeminiModelIds(apiKey: string): Promise<string[]> {
  if (!apiKey) {
    throw new Error(`${API_KEY_ENV} is required to call models.list`);
  }

  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(GEMINI_MODELS_URL);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        // Prefer header over ?key= so the secret is less likely to appear in URL logs.
        "x-goog-api-key": apiKey,
      },
    });

    if (!response.ok) {
      // Do not include response URL (could echo query params) or bodies that might contain secrets.
      throw new Error(`models.list failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as ListModelsResponse;
    for (const model of body.models ?? []) {
      if (typeof model.name === "string" && model.name.length > 0) {
        ids.push(normalizeModelId(model.name));
      }
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return ids;
}

function parseCsvModels(value: string): string[] {
  return value
    .split(",")
    .map((part) => normalizeModelId(part))
    .filter(Boolean);
}

function parseArgs(argv: string[]): {
  json: boolean;
  available: string[] | null;
  applyUpdate: string | null;
  missingRegistered: string[] | null;
} {
  let json = false;
  let available: string[] | null = null;
  let applyUpdate: string | null = null;
  let missingRegistered: string[] | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--available") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--available requires a comma-separated model list");
      }
      available = parseCsvModels(value);
      continue;
    }
    if (arg === "--apply-update") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--apply-update requires a model id");
      }
      applyUpdate = normalizeModelId(value);
      continue;
    }
    if (arg === "--missing-registered") {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(
          "--missing-registered requires a comma-separated model list (may be empty)"
        );
      }
      missingRegistered = parseCsvModels(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { json, available, applyUpdate, missingRegistered };
}

async function main(): Promise<void> {
  const { json, available, applyUpdate, missingRegistered } = parseArgs(process.argv.slice(2));

  if (applyUpdate) {
    const source = readFileSync(CONSTANTS_PATH, "utf8");
    const current = readRegisteredModelsFromSource(source);
    let missing = missingRegistered;
    if (missing === null && available) {
      missing = findMissingRegisteredModels(available, [current.primary, current.alternate]);
    }
    const update = planConstantsUpdate(current, applyUpdate, missing ?? []);
    const next = applyModelConstantsUpdate(source, update.newPrimary, update.newAlternate);
    writeFileSync(CONSTANTS_PATH, next, "utf8");
    console.log(
      `Updated gemini.ts: primary=${update.newPrimary} alternate=${update.newAlternate}` +
        (update.primaryWasMissing
          ? " (kept alternate; previous primary missing from models.list)"
          : "")
    );
    return;
  }

  const availableIds = available ?? (await fetchGeminiModelIds(process.env[API_KEY_ENV] ?? ""));
  // Single source: GEMINI_REGISTERED_MODELS (primary first, then alternate).
  const plan = planModelCheck(availableIds);

  if (json) {
    // Structured output for GitHub Actions. No secrets.
    console.log(JSON.stringify(plan));
    return;
  }

  console.log(`Registered primary: ${plan.registered.primary}`);
  console.log(`Registered alternate: ${plan.registered.alternate}`);
  console.log(`Newer stable Flash: ${plan.newerStableFlash ?? "(none)"}`);
  console.log(
    `Missing registered: ${
      plan.missingRegistered.length > 0 ? plan.missingRegistered.join(", ") : "(none)"
    }`
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(message);
    process.exit(1);
  });
}
