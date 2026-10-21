import { describe, expect, it } from "vitest";
import { isManageGroupNavActive } from "@/app/(authenticated)/manage/components/ManageGroupNav";
import { resolveWeeklyFunnelWeeks, WEEKLY_FUNNEL_WEEKS } from "@/app/constants/analytics";
import {
  MANAGE_CONTENTS_BULK_PATH,
  MANAGE_CONTENTS_TREE_PATH,
  manageContentsDeleteHref,
  manageContentsEditHref,
  manageContentsReturnPath,
} from "@/app/lib/manage-contents-paths";

describe("manageContentsReturnPath", () => {
  it("from=bulk のときだけ一括操作タブへ戻す", () => {
    expect(manageContentsReturnPath("bulk")).toBe(MANAGE_CONTENTS_BULK_PATH);
    expect(manageContentsReturnPath(undefined)).toBe(MANAGE_CONTENTS_TREE_PATH);
    expect(manageContentsReturnPath("tree")).toBe(MANAGE_CONTENTS_TREE_PATH);
  });

  it("編集・削除リンクに from=bulk を付ける", () => {
    expect(manageContentsEditHref(3, true)).toBe("/manage/contents/3/edit?from=bulk");
    expect(manageContentsDeleteHref(3, false)).toBe("/manage/contents/3/delete");
  });
});

describe("isManageGroupNavActive", () => {
  const hrefs = ["/manage/contents", "/manage/contents/bulk"];

  it("構成ツリーと一括操作で最長一致する", () => {
    expect(isManageGroupNavActive("/manage/contents", "/manage/contents", hrefs)).toBe(true);
    expect(isManageGroupNavActive("/manage/contents/bulk", "/manage/contents", hrefs)).toBe(false);
    expect(isManageGroupNavActive("/manage/contents/bulk", "/manage/contents/bulk", hrefs)).toBe(
      true
    );
    expect(isManageGroupNavActive("/manage/contents/9/edit", "/manage/contents", hrefs)).toBe(true);
  });
});

describe("resolveWeeklyFunnelWeeks", () => {
  it("許可リスト外は既定の8週へフォールバックする", () => {
    expect(resolveWeeklyFunnelWeeks("26")).toBe(26);
    expect(resolveWeeklyFunnelWeeks("52")).toBe(52);
    expect(resolveWeeklyFunnelWeeks("9")).toBe(WEEKLY_FUNNEL_WEEKS);
    expect(resolveWeeklyFunnelWeeks("104")).toBe(WEEKLY_FUNNEL_WEEKS);
    expect(resolveWeeklyFunnelWeeks(undefined)).toBe(WEEKLY_FUNNEL_WEEKS);
  });
});
