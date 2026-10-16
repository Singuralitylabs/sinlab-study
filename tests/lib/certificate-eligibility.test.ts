import { describe, expect, it } from "vitest";
import { isThemeCompleted } from "@/app/lib/certificate";
import {
  certificateExerciseGaps,
  exerciseRequiresRubricPass,
  formatCertificateRemainder,
  noticeFromProgressBody,
  passedContentIdsFromReviews,
  pendingCertificateStatus,
  themeCompletionCopy,
} from "@/app/lib/certificate-eligibility";

const code = (id: number, hasRubric = true) => ({
  id,
  allowedSubmissionTypes: "code" as const,
  hasRubric,
});

describe("certificateExerciseGaps", () => {
  it("演習が未提出なら発行条件を満たさない", () => {
    expect(
      certificateExerciseGaps({
        exercises: [code(1)],
        submittedContentIds: new Set(),
        passedContentIds: new Set(),
        passScore: 80,
      })
    ).toEqual({ unsubmittedExercises: 1, exercisesNeedingRetry: 0 });
  });

  it("採点基準ありで passed = false だけなら再挑戦が必要", () => {
    expect(
      certificateExerciseGaps({
        exercises: [code(1)],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set(),
        passScore: 80,
      })
    ).toEqual({ unsubmittedExercises: 0, exercisesNeedingRetry: 1 });
  });

  it("passed = true が 1 件でもあれば再挑戦に数えない", () => {
    expect(
      certificateExerciseGaps({
        exercises: [code(1)],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set([1]),
        passScore: 80,
      })
    ).toEqual({ unsubmittedExercises: 0, exercisesNeedingRetry: 0 });
  });

  it("CERTIFICATE_PASS_SCORE = 0 なら提出があれば合格は要らない", () => {
    expect(
      certificateExerciseGaps({
        exercises: [code(1)],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set(),
        passScore: 0,
      })
    ).toEqual({ unsubmittedExercises: 0, exercisesNeedingRetry: 0 });
  });

  it("採点基準が無ければ提出があれば足りる", () => {
    expect(
      certificateExerciseGaps({
        exercises: [code(1, false)],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set(),
        passScore: 80,
      })
    ).toEqual({ unsubmittedExercises: 0, exercisesNeedingRetry: 0 });
  });

  it("URL のみの演習は提出があれば足りる", () => {
    expect(
      certificateExerciseGaps({
        exercises: [{ id: 1, allowedSubmissionTypes: "url", hasRubric: true }],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set(),
        passScore: 80,
      })
    ).toEqual({ unsubmittedExercises: 0, exercisesNeedingRetry: 0 });
    expect(
      exerciseRequiresRubricPass({ id: 1, allowedSubmissionTypes: "url", hasRubric: true }, 80)
    ).toBe(false);
  });

  it("both はコード提出の合格が必要（URL だけでは passed にならない）", () => {
    expect(
      certificateExerciseGaps({
        exercises: [{ id: 1, allowedSubmissionTypes: "both", hasRubric: true }],
        submittedContentIds: new Set([1]),
        passedContentIds: new Set(),
        passScore: 80,
      }).exercisesNeedingRetry
    ).toBe(1);
  });
});

describe("passedContentIdsFromReviews", () => {
  const submissions = [{ id: 7, contentId: 1 }];

  it.each(["estimated", "none", "legacy"])("%s は合否に使わない", (scoreKind) => {
    expect(
      passedContentIdsFromReviews(submissions, [{ submissionId: 7, scoreKind, passed: true }]).size
    ).toBe(0);
  });

  it("rubric の passed = true が一つあれば、後の不合格では消さない", () => {
    const passed = passedContentIdsFromReviews(submissions, [
      { submissionId: 7, scoreKind: "rubric", passed: true },
      { submissionId: 7, scoreKind: "rubric", passed: false },
      { submissionId: 7, scoreKind: "estimated", passed: false },
    ]);
    expect(passed).toEqual(new Set([1]));
  });
});

describe("テーマ修了の文言", () => {
  const base = {
    themeId: 5,
    themeName: "基礎",
    blockedByMissingName: false,
    remaining: { incompleteContents: 0, unsubmittedExercises: 0, exercisesNeedingRetry: 0 },
  };

  it("発行済みと条件残りで文言が変わる", () => {
    const issued = themeCompletionCopy({ ...base, certificateId: 31 });
    expect(issued.title).toBe("『基礎』を修了しました");
    expect(issued.description).toBe("修了証を発行しました");
    expect(issued.href).toBe("/certificates/31");

    const remaining = themeCompletionCopy({
      ...base,
      certificateId: null,
      remaining: { incompleteContents: 0, unsubmittedExercises: 1, exercisesNeedingRetry: 2 },
    });
    expect(remaining.description).toBe(
      "修了証の発行には、あと 未提出の演習が 1 件、再挑戦が必要な演習が 2 件 が必要です"
    );
    expect(remaining.href).toBe("/certificates");
  });

  it("未完了の取り消し応答からは通知を拾わない", () => {
    const body = { themeCompletion: { ...base, certificateId: 1 } };
    expect(noticeFromProgressBody(false, body)).toBeNull();
    expect(noticeFromProgressBody(true, body)?.certificateId).toBe(1);
  });

  it("ダイアログ幅は画面端まで広がらないクラスを持つ", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("app/components/ThemeCompletionDialog.tsx", "utf8")
    );
    expect(source).toContain("w-full");
    expect(source).toContain("sm:max-w-md");
    expect(source).toContain('data-testid="theme-completion-dialog"');
  });
});

describe("pendingCertificateStatus", () => {
  it("100% の判定は isThemeCompleted と一致する", () => {
    for (const [total, completed] of [
      [0, 0],
      [2, 1],
      [2, 2],
    ] as const) {
      const status = pendingCertificateStatus({
        totalContents: total,
        completedContents: completed,
        exerciseGap: { unsubmittedExercises: 0, exercisesNeedingRetry: 0 },
        blockedByMissingName: false,
      });
      const done = isThemeCompleted({ totalContents: total, completedContents: completed });
      expect(status.kind === "in-progress").toBe(!done);
    }
  });

  it("未完了では件数を添え、100% で未提出なら失敗文言にしない", () => {
    const mid = pendingCertificateStatus({
      totalContents: 2,
      completedContents: 1,
      exerciseGap: null,
      blockedByMissingName: false,
    });
    expect(mid).toMatchObject({
      kind: "in-progress",
      label: "修了すると発行されます（1 / 2）",
      remainder: "未完了のコンテンツが 1 件",
    });

    const gaps = pendingCertificateStatus({
      totalContents: 2,
      completedContents: 2,
      exerciseGap: { unsubmittedExercises: 1, exercisesNeedingRetry: 0 },
      blockedByMissingName: true,
    });
    expect(gaps.kind).toBe("remaining");

    const named = pendingCertificateStatus({
      totalContents: 2,
      completedContents: 2,
      exerciseGap: { unsubmittedExercises: 0, exercisesNeedingRetry: 0 },
      blockedByMissingName: true,
    });
    expect(named.kind).toBe("name-blocked");
  });
});

describe("formatCertificateRemainder", () => {
  it("0 件は省略する", () => {
    expect(
      formatCertificateRemainder({
        incompleteContents: 0,
        unsubmittedExercises: 0,
        exercisesNeedingRetry: 0,
      })
    ).toBe("");
  });
});
