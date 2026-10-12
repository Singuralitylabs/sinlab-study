import { describe, expect, it } from "vitest";
import {
  quizQuestionsUpdatedNotice,
  quizQuestionVersion,
  resetForNewQuizVersion,
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

describe("resetForNewQuizVersion", () => {
  const empty = { answers: {}, gradeResult: null, errorState: null };
  const opts = { questionCount: 2, isSubmitting: false };

  it("回答・結果・エラーをすべて消す", () => {
    const next = resetForNewQuizVersion(
      {
        answers: { 1: "a" },
        gradeResult: { version: "v1", value: "結果" },
        errorState: { version: "v1", value: "エラー" },
      },
      "v1",
      opts
    );

    expect(next).toMatchObject({ answers: {}, gradeResult: null, errorState: null });
  });

  it("版が v1 → v2 → v1 と往復しても、v1 のときのエラーは再表示されない", () => {
    // v1 で送信 → v2 にリセット → 失敗応答が v1 のエラーとして届く（非表示）→ v1 に戻る
    const afterLateError = {
      ...empty,
      errorState: { version: "v1", value: "採点できませんでした" },
    };
    expect(valueForVersion(afterLateError.errorState, "v2")).toBeNull();

    const next = resetForNewQuizVersion(afterLateError, "v2", opts);

    expect(valueForVersion(next.errorState, "v1")).toBeNull();
  });

  it("表示されていた回答・結果・エラー・送信中があれば注記を出す", () => {
    const notice = "設問が更新されたため、回答をやり直してください";
    expect(resetForNewQuizVersion({ ...empty, answers: { 1: "a" } }, "v1", opts).notice).toBe(
      notice
    );
    expect(
      resetForNewQuizVersion({ ...empty, gradeResult: { version: "v1", value: 1 } }, "v1", opts)
        .notice
    ).toBe(notice);
    expect(
      resetForNewQuizVersion({ ...empty, errorState: { version: "v1", value: "e" } }, "v1", opts)
        .notice
    ).toBe(notice);
    expect(resetForNewQuizVersion(empty, "v1", { ...opts, isSubmitting: true }).notice).toBe(
      notice
    );
  });

  it("版違いで非表示だった古い結果は「破棄したもの」に数えない", () => {
    const hiddenOldResult = { ...empty, gradeResult: { version: "v1", value: 1 } };

    expect(resetForNewQuizVersion(hiddenOldResult, "v2", opts).notice).toBeNull();
  });

  it("何も表示されていなければ注記を出さない", () => {
    expect(resetForNewQuizVersion(empty, "v1", opts).notice).toBeNull();
  });
});
