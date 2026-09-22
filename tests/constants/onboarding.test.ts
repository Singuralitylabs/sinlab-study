import { describe, expect, it } from "vitest";
import {
  GETTING_STARTED_STEPS,
  getWelcomeStepsForStatus,
  WELCOME_DIALOG_STEPS,
} from "@/app/constants/onboarding";

describe("WELCOME_DIALOG_STEPS", () => {
  it("4ステップ定義を持ち trialOnly はプランのステップのみ", () => {
    expect(WELCOME_DIALOG_STEPS).toHaveLength(4);
    expect(WELCOME_DIALOG_STEPS.map((step) => step.id)).toEqual([
      "welcome",
      "how-to-learn",
      "plan",
      "help",
    ]);
    expect(WELCOME_DIALOG_STEPS.filter((step) => step.trialOnly).map((step) => step.id)).toEqual([
      "plan",
    ]);
  });
});

describe("getWelcomeStepsForStatus", () => {
  it("trial にはプランのステップを含める", () => {
    const steps = getWelcomeStepsForStatus("trial");
    expect(steps.map((step) => step.id)).toContain("plan");
    expect(steps).toHaveLength(4);
  });

  it("active にはプランのステップを含めない", () => {
    const steps = getWelcomeStepsForStatus("active");
    expect(steps.map((step) => step.id)).not.toContain("plan");
    expect(steps).toHaveLength(3);
  });

  it("null にはプランのステップを含めない", () => {
    const steps = getWelcomeStepsForStatus(null);
    expect(steps.map((step) => step.id)).not.toContain("plan");
  });
});

describe("GETTING_STARTED_STEPS", () => {
  it("3項目定義を持つ", () => {
    expect(GETTING_STARTED_STEPS.map((step) => step.key)).toEqual([
      "complete-content",
      "submit-exercise",
      "receive-ai-review",
    ]);
  });
});
