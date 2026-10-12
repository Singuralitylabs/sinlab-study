import { describe, expect, it } from "vitest";
import {
  isStaleQuizGrade,
  quizQuestionsUpdatedNotice,
  quizQuestionVersion,
} from "@/app/lib/quiz-form";

describe("quizQuestionVersion", () => {
  const questions = [
    { id: 1, revision: "a" },
    { id: 2, revision: "b" },
  ];

  it("同じ id・revision なら同じ版（解説・正解だけの修正では revision が変わらず、結果を残す）", () => {
    expect(quizQuestionVersion(questions)).toBe(quizQuestionVersion([...questions]));
  });

  it.each([
    ["設問文・選択肢の変更（revision が変わる）", [{ id: 1, revision: "a2" }, questions[1]]],
    ["設問の削除", [questions[0]]],
    ["設問の追加", [...questions, { id: 3, revision: "c" }]],
    ["並び替え", [questions[1], questions[0]]],
  ])("%sで版が変わる", (_label, next) => {
    expect(quizQuestionVersion(next)).not.toBe(quizQuestionVersion(questions));
  });
});

describe("quizQuestionsUpdatedNotice", () => {
  it("設問が残っていればやり直しを促す", () => {
    expect(quizQuestionsUpdatedNotice(2)).toBe("設問が更新されたため、回答をやり直してください");
  });

  it("設問が0件になったら出さない（「設問が登録されていません」だけを表示する）", () => {
    expect(quizQuestionsUpdatedNotice(0)).toBeNull();
  });
});

describe("isStaleQuizGrade", () => {
  it("送信時と同じ版なら結果を使う", () => {
    expect(isStaleQuizGrade("1:a", "1:a")).toBe(false);
  });

  it("応答待ちの間に版が変わったら結果を捨てる", () => {
    expect(isStaleQuizGrade("1:a", "1:a2")).toBe(true);
  });
});
