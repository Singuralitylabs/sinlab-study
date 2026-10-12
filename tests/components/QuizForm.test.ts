import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { QuizForm } from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/QuizForm";

const question = {
  id: 1,
  question_type: "single" as const,
  question: createElement("p", null, "設問A"),
  choices: [createElement("span", null, "選択肢1"), createElement("span", null, "選択肢2")],
  hint: null,
  revision: "r1",
};

const render = (questions: (typeof question)[]) =>
  renderToStaticMarkup(
    createElement(QuizForm, {
      contentId: 5,
      questions,
      canRecordProgress: true,
      initialCompleted: false,
    })
  );

describe("QuizForm の初回表示", () => {
  it("初回は版のリセットが起きず、設問を表示して更新の注記は出さない", () => {
    const html = render([question]);

    expect(html).toContain("設問A");
    expect(html).toContain("選択肢2");
    expect(html).not.toContain("設問が更新された");
  });

  it("設問が0件なら登録されていない旨だけを表示する", () => {
    const html = render([]);

    expect(html).toContain("このクイズには設問が登録されていません。");
    expect(html).not.toContain("設問が更新された");
  });
});
