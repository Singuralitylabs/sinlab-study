import { describe, expect, it } from "vitest";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import {
  buildWelcomeDialogSteps,
  GETTING_STARTED_STEPS,
  getWelcomeStepsForStatus,
} from "@/app/constants/onboarding";

describe("buildWelcomeDialogSteps", () => {
  const WELCOME_DIALOG_STEPS = buildWelcomeDialogSteps(AI_REVIEW_LIMITS);

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
    const steps = getWelcomeStepsForStatus("trial", AI_REVIEW_LIMITS);
    expect(steps.map((step) => step.id)).toContain("plan");
    expect(steps).toHaveLength(4);
  });

  it("active にはプランのステップを含めない", () => {
    const steps = getWelcomeStepsForStatus("active", AI_REVIEW_LIMITS);
    expect(steps.map((step) => step.id)).not.toContain("plan");
    expect(steps).toHaveLength(3);
  });

  it("null にはプランのステップを含めない", () => {
    const steps = getWelcomeStepsForStatus(null, AI_REVIEW_LIMITS);
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
