import { describe, expect, it } from "vitest";
import { QUIZ_MAX_CHOICES, QUIZ_MAX_QUESTIONS } from "@/app/constants/quiz";
import { QuizQuestionSchema, QuizQuestionsSchema } from "@/app/lib/quiz";

const single = {
  question_type: "single",
  question: "HTTP のデフォルトポートは？",
  choices: ["80", "443", "8080"],
  correct_choices: [0],
  explanation: "HTTP は 80 番",
};

const issuesOf = (value: unknown) => {
  const result = QuizQuestionSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("QuizQuestionSchema", () => {
  it("単一選択の正しい設問を受理し、空のヒント等は null に正規化する", () => {
    const result = QuizQuestionSchema.safeParse({ ...single, hint: "  ", model_answer: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hint).toBeNull();
      // Choice formats never store a model answer.
      expect(result.data.model_answer).toBeNull();
    }
  });

  it("単一選択で正解が2つは検証エラー", () => {
    expect(issuesOf({ ...single, correct_choices: [0, 1] })).toContain(
      "単一選択の設問は正解を1つ選んでください"
    );
  });

  it("選択式で正解が未指定は検証エラー", () => {
    expect(issuesOf({ ...single, correct_choices: [] }).length).toBeGreaterThan(0);
    expect(issuesOf({ ...single, question_type: "multiple", correct_choices: [] })).toContain(
      "複数選択の設問は正解を1つ以上選んでください"
    );
  });

  it("存在しない選択肢・重複した正解は検証エラー", () => {
    expect(issuesOf({ ...single, correct_choices: [3] })).toContain(
      "正解に存在しない選択肢が指定されています"
    );
    expect(issuesOf({ ...single, question_type: "multiple", correct_choices: [1, 1] })).toContain(
      "正解の選択肢が重複しています"
    );
  });

  it("選択肢の数が範囲外なら検証エラー", () => {
    expect(issuesOf({ ...single, choices: ["only"] }).length).toBeGreaterThan(0);
    expect(
      issuesOf({
        ...single,
        choices: Array.from({ length: QUIZ_MAX_CHOICES + 1 }, (_, i) => `${i}`),
      }).length
    ).toBeGreaterThan(0);
  });

  it("空の選択肢・空の設問文は検証エラー", () => {
    expect(issuesOf({ ...single, choices: ["a", "  "] })).toContain("選択肢を入力してください");
    expect(issuesOf({ ...single, question: "" })).toContain("設問を入力してください");
  });

  it("複数選択の正解は昇順に並べ替える", () => {
    const result = QuizQuestionSchema.safeParse({
      ...single,
      question_type: "multiple",
      correct_choices: [2, 0],
    });
    expect(result.success && result.data.correct_choices).toEqual([0, 2]);
  });

  it("入力式は模範解答が必須で、選択肢は指定できない", () => {
    const text = { question_type: "text", question: "説明せよ", model_answer: "模範" };
    expect(QuizQuestionSchema.safeParse(text).success).toBe(true);
    expect(issuesOf({ ...text, model_answer: " " })).toContain(
      "入力式の設問には模範解答を入力してください"
    );
    expect(issuesOf({ ...text, choices: ["a", "b"] })).toContain(
      "入力式の設問には選択肢を指定できません"
    );
  });

  it("形式が許可値以外なら検証エラー", () => {
    expect(QuizQuestionSchema.safeParse({ ...single, question_type: "essay" }).success).toBe(false);
  });
});

describe("QuizQuestionsSchema", () => {
  it(`設問は1〜${QUIZ_MAX_QUESTIONS}個`, () => {
    expect(QuizQuestionsSchema.safeParse([]).success).toBe(false);
    expect(QuizQuestionsSchema.safeParse([single]).success).toBe(true);
    expect(
      QuizQuestionsSchema.safeParse(Array.from({ length: QUIZ_MAX_QUESTIONS + 1 }, () => single))
        .success
    ).toBe(false);
  });
});
