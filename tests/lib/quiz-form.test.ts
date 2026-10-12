import { describe, expect, it } from "vitest";
import {
  quizQuestionsUpdatedNotice,
  quizQuestionVersion,
  valueForVersion,
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
  it("回答・結果を破棄したときはやり直しを促す", () => {
    expect(quizQuestionsUpdatedNotice(2, true)).toBe(
      "設問が更新されたため、回答をやり直してください"
    );
  });

  it("破棄したものがなければ出さない（回答前の再描画でやり直す回答はない）", () => {
    expect(quizQuestionsUpdatedNotice(2, false)).toBeNull();
  });

  it("設問が0件になったら出さない（「設問が登録されていません」だけを表示する）", () => {
    expect(quizQuestionsUpdatedNotice(0, true)).toBeNull();
  });
});

describe("valueForVersion", () => {
  const entry = { version: "1:a", value: "結果" };

  it("作られた版が現在の版なら値を返す", () => {
    expect(valueForVersion(entry, "1:a")).toBe("結果");
  });

  it("応答待ちの間に版が変わったら（届く順序に関係なく）表示しない", () => {
    expect(valueForVersion(entry, "1:a2")).toBeNull();
  });

  it("値がなければ null", () => {
    expect(valueForVersion(null, "1:a")).toBeNull();
  });
});
