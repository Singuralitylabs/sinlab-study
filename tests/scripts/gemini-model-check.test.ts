import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GEMINI_REGISTERED_MODELS } from "../../app/constants/gemini";
import {
  applyModelConstantsUpdate,
  compareVersions,
  findMissingRegisteredModels,
  findNewerStableFlash,
  isStableFlashModel,
  normalizeModelId,
  parseFlashVersion,
  planConstantsUpdate,
  planModelCheck,
  readRegisteredModelsFromSource,
  registeredModelsFromList,
} from "../../scripts/gemini-model-check";

describe("normalizeModelId", () => {
  it("strips the models/ resource prefix", () => {
    expect(normalizeModelId("models/gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash");
  });
});

describe("isStableFlashModel / parseFlashVersion", () => {
  it("accepts stable Flash ids and parses version parts", () => {
    expect(isStableFlashModel("gemini-3.8-flash")).toBe(true);
    expect(isStableFlashModel("gemini-3-flash")).toBe(true);
    expect(parseFlashVersion("gemini-3.8-flash")).toEqual([3, 8]);
    expect(parseFlashVersion("gemini-3-flash")).toEqual([3]);
  });

  it("excludes preview, exp, latest aliases, and other Flash variants", () => {
    expect(isStableFlashModel("gemini-3-flash-preview")).toBe(false);
    expect(isStableFlashModel("gemini-2.0-flash-exp")).toBe(false);
    expect(isStableFlashModel("gemini-2.0-flash-experimental")).toBe(false);
    expect(isStableFlashModel("gemini-flash-latest")).toBe(false);
    expect(isStableFlashModel("gemini-3.5-flash-lite")).toBe(false);
    expect(isStableFlashModel("gemini-3.8-flash-tts")).toBe(false);
    expect(isStableFlashModel("gemini-3.1-flash-live-preview")).toBe(false);
    expect(isStableFlashModel("gemini-3.1-pro-preview")).toBe(false);
    expect(parseFlashVersion("gemini-3-flash-preview")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders multi-part versions", () => {
    expect(compareVersions([3, 8], [3, 6])).toBeGreaterThan(0);
    expect(compareVersions([3, 6], [3, 8])).toBeLessThan(0);
    expect(compareVersions([3, 8], [3, 8])).toBe(0);
    expect(compareVersions([4], [3, 9])).toBeGreaterThan(0);
    expect(compareVersions([3], [3, 0])).toBe(0);
  });
});

describe("findNewerStableFlash", () => {
  it("returns the newest stable Flash newer than the primary", () => {
    expect(
      findNewerStableFlash(
        [
          "models/gemini-3.6-flash",
          "gemini-3.8-flash",
          "gemini-4.0-flash",
          "gemini-4.0-flash-preview",
          "gemini-flash-latest",
          "gemini-3.5-flash-lite",
        ],
        "gemini-3.6-flash"
      )
    ).toBe("gemini-4.0-flash");
  });

  it("returns null when nothing newer and stable exists", () => {
    expect(
      findNewerStableFlash(
        ["gemini-3.8-flash", "gemini-3.8-flash-preview", "gemini-4.0-flash-exp"],
        "gemini-3.8-flash"
      )
    ).toBeNull();
  });
});

describe("findMissingRegisteredModels", () => {
  it("reports registered models absent from the available list", () => {
    expect(
      findMissingRegisteredModels(["gemini-3.8-flash"], ["gemini-3.8-flash", "gemini-3.6-flash"])
    ).toEqual(["gemini-3.6-flash"]);
  });

  it("returns empty when every registered model is present", () => {
    expect(
      findMissingRegisteredModels(
        ["models/gemini-3.8-flash", "models/gemini-3.6-flash"],
        ["gemini-3.8-flash", "gemini-3.6-flash"]
      )
    ).toEqual([]);
  });
});

describe("planModelCheck / GEMINI_REGISTERED_MODELS", () => {
  it("uses GEMINI_REGISTERED_MODELS as the default registered list", () => {
    expect(registeredModelsFromList()).toEqual({
      primary: GEMINI_REGISTERED_MODELS[0],
      alternate: GEMINI_REGISTERED_MODELS[1],
    });
    expect(planModelCheck([...GEMINI_REGISTERED_MODELS])).toEqual({
      newerStableFlash: null,
      missingRegistered: [],
      registered: {
        primary: GEMINI_REGISTERED_MODELS[0],
        alternate: GEMINI_REGISTERED_MODELS[1],
      },
    });
  });

  it("combines update and missing signals from a registered list", () => {
    expect(planModelCheck(["gemini-4.0-flash"], ["gemini-3.8-flash", "gemini-3.6-flash"])).toEqual({
      newerStableFlash: "gemini-4.0-flash",
      missingRegistered: ["gemini-3.8-flash", "gemini-3.6-flash"],
      registered: {
        primary: "gemini-3.8-flash",
        alternate: "gemini-3.6-flash",
      },
    });
  });

  it("is a noop plan when the list matches and nothing is newer", () => {
    expect(
      planModelCheck(
        ["gemini-3.8-flash", "gemini-3.6-flash"],
        ["gemini-3.8-flash", "gemini-3.6-flash"]
      )
    ).toEqual({
      newerStableFlash: null,
      missingRegistered: [],
      registered: {
        primary: "gemini-3.8-flash",
        alternate: "gemini-3.6-flash",
      },
    });
  });
});

describe("planConstantsUpdate", () => {
  it("promotes the previous primary to alternate when primary is still listed", () => {
    expect(
      planConstantsUpdate(
        { primary: "gemini-3.8-flash", alternate: "gemini-3.6-flash" },
        "gemini-4.0-flash",
        []
      )
    ).toEqual({
      newPrimary: "gemini-4.0-flash",
      newAlternate: "gemini-3.8-flash",
      primaryWasMissing: false,
    });
  });

  it("keeps the previous alternate when the current primary is missing", () => {
    expect(
      planConstantsUpdate(
        { primary: "gemini-3.8-flash", alternate: "gemini-3.6-flash" },
        "gemini-4.0-flash",
        ["gemini-3.8-flash"]
      )
    ).toEqual({
      newPrimary: "gemini-4.0-flash",
      newAlternate: "gemini-3.6-flash",
      primaryWasMissing: true,
    });
  });
});

describe("applyModelConstantsUpdate / readRegisteredModelsFromSource", () => {
  it("rewrites primary and promotes the previous primary to alternate", () => {
    const source = readFileSync(resolve("app/constants/gemini.ts"), "utf8");
    const current = readRegisteredModelsFromSource(source);
    expect(current.primary).toBe("gemini-3.8-flash");
    expect(current.alternate).toBe("gemini-3.6-flash");

    const update = planConstantsUpdate(current, "gemini-4.0-flash", []);
    const updated = applyModelConstantsUpdate(source, update.newPrimary, update.newAlternate);
    expect(readRegisteredModelsFromSource(updated)).toEqual({
      primary: "gemini-4.0-flash",
      alternate: "gemini-3.8-flash",
    });
  });

  it("does not write a missing primary into the alternate slot", () => {
    const source = readFileSync(resolve("app/constants/gemini.ts"), "utf8");
    const current = readRegisteredModelsFromSource(source);
    const update = planConstantsUpdate(current, "gemini-4.0-flash", [current.primary]);
    const updated = applyModelConstantsUpdate(source, update.newPrimary, update.newAlternate);
    expect(readRegisteredModelsFromSource(updated)).toEqual({
      primary: "gemini-4.0-flash",
      alternate: current.alternate,
    });
  });

  it("refuses non-stable Flash ids", () => {
    const source = 'export const GEMINI_MODEL_NAME = "gemini-3.8-flash";\n';
    expect(() =>
      applyModelConstantsUpdate(source, "gemini-flash-latest", "gemini-3.8-flash")
    ).toThrow(/non-stable/);
  });
});
