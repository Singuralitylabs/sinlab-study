import { describe, expect, it } from "vitest";
import {
  quizCompletionAction,
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
  const empty = { gradeResult: null, errorState: null };
  const opts = { questionCount: 2, hasAnswer: false, isSubmitting: false };
  const notice = "設問が更新されたため、回答をやり直してください";

  it("結果・エラーをすべて消す", () => {
    const next = resetForNewQuizVersion(
      { gradeResult: { version: "v1", value: "結果" }, errorState: { version: "v1", value: "e" } },
      "v1",
      opts
    );

    expect(next).toMatchObject({ gradeResult: null, errorState: null });
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

  it("回答・表示されていた結果・エラー・送信中のいずれかがあれば注記を出す", () => {
    expect(resetForNewQuizVersion(empty, "v1", { ...opts, hasAnswer: true }).notice).toBe(notice);
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

  it("空にした回答（hasAnswer: false）だけなら注記を出さない", () => {
    expect(resetForNewQuizVersion(empty, "v1", opts).notice).toBeNull();
  });
});

describe("quizCompletionAction", () => {
  const base = {
    resultVersion: "v1",
    questionVersion: "v1",
    handled: false,
    completionPending: false,
    canRecordProgress: true,
    initialCompleted: false,
  };

  it("現在の版の未処理の結果は記録する", () => {
    expect(quizCompletionAction(base)).toBe("record");
  });

  it.each([
    ["結果がない", { resultVersion: null }],
    ["古い版の結果（応答待ちの間に設問が変わった）", { resultVersion: "v0" }],
    ["処理済みの結果（同じ結果での再実行）", { handled: true }],
  ])("%sなら何もしない", (_label, override) => {
    expect(quizCompletionAction({ ...base, ...override })).toBe("skip");
  });

  it.each([
    ["プレビュー中", { canRecordProgress: false }],
    ["完了済み", { initialCompleted: true }],
    ["記録の送信後で再描画がまだ（すぐに解き直した）", { completionPending: true }],
  ])("%sなら記録せず処理済みにする", (_label, override) => {
    expect(quizCompletionAction({ ...base, ...override })).toBe("mark-handled");
  });
});
