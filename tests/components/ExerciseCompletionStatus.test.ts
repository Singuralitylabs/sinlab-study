import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CERTIFICATE_PASS_SCORE } from "@/app/constants/grading";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

import { ExerciseCompletionStatus } from "@/app/(authenticated)/learn/[themeId]/[phaseId]/[weekId]/[contentId]/ExerciseCompletionStatus";

const renderStatus = (
  props: Partial<{
    initialCompleted: boolean;
    hasPassingReview: boolean;
    passUnachievable: boolean;
    userStatus: "active" | "trial" | null;
    allowsUrlSubmission: boolean;
  }> = {}
) =>
  renderToStaticMarkup(
    createElement(ExerciseCompletionStatus, {
      contentId: 10,
      initialCompleted: false,
      hasPassingReview: false,
      passUnachievable: false,
      userStatus: "active",
      allowsUrlSubmission: false,
      ...props,
    })
  );

describe("ExerciseCompletionStatus", () => {
  it("未合格は完了ボタンを出さず、合格点を定数から表示する", () => {
    const html = renderStatus();

    expect(html).toContain(
      `AIレビューで合格（${CERTIFICATE_PASS_SCORE}点以上・未達成の要件なし）すると完了になります`
    );
    expect(html).toContain("1 日 2 回");
    expect(html).not.toContain("完了を記録する");
    expect(html).not.toContain("完了済み（クリックで未完了に戻す）");
    expect(html).not.toContain("修了証");
  });

  it("trial には生涯 1 回で完了できない旨を出し、修了証は出さない", () => {
    const html = renderStatus({ userStatus: "trial", allowsUrlSubmission: true });

    expect(html).toContain("1 課題につき 1 回");
    expect(html).toContain("お試しの間はこの演習を完了できません");
    expect(html).toContain("URL 提出は採点対象外");
    expect(html).not.toContain("修了証");
  });

  it("合格済みで未完了のときだけ完了を記録するボタンを出す", () => {
    const html = renderStatus({ hasPassingReview: true });

    expect(html).toContain("完了を記録する");
    expect(html).not.toContain("点以上");
  });

  it("完了済みは状態表示だけで、未完了へ戻す操作を出さない", () => {
    const html = renderStatus({ initialCompleted: true, hasPassingReview: true });

    expect(html).toContain("合格済み（完了）");
    expect(html).not.toContain("完了を記録する");
    expect(html).not.toContain("<button");
  });

  it("合格レビューが無い完了は「完了」だけを出す", () => {
    const html = renderStatus({ initialCompleted: true, hasPassingReview: false });

    expect(html).toContain("完了");
    expect(html).not.toContain("合格済み");
    expect(html).not.toContain("<button");
  });

  it("空の採点基準では合格点の案内を出さず、完了できない旨だけを出す", () => {
    const html = renderStatus({ passUnachievable: true, allowsUrlSubmission: true });

    expect(html).toContain("現在この演習は完了できません");
    expect(html).not.toContain("点以上");
    expect(html).not.toContain("コードで提出してください");
    expect(html).not.toContain("完了を記録する");
  });
});
