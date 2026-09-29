import { describe, expect, it } from "vitest";
import { describeAnnouncementTargets, isAnnouncementTarget } from "@/app/lib/announcement-target";

describe("isAnnouncementTarget", () => {
  const all = { target_statuses: ["active", "trial"], target_membership_types: null };
  const generalOnly = { target_statuses: ["active"], target_membership_types: ["general"] };

  it("対象ステータスに含まれ、会員種別が全種別（NULL）なら対象", () => {
    expect(isAnnouncementTarget(all, { status: "active", membershipType: "community" })).toBe(true);
    expect(isAnnouncementTarget(all, { status: "trial", membershipType: null })).toBe(true);
  });

  it("対象ステータスに含まれない（却下・お試し非対象・不明）なら対象外", () => {
    const activeOnly = { target_statuses: ["active"], target_membership_types: null };
    expect(isAnnouncementTarget(activeOnly, { status: "trial", membershipType: null })).toBe(false);
    expect(isAnnouncementTarget(all, { status: "rejected", membershipType: "general" })).toBe(
      false
    );
    expect(isAnnouncementTarget(all, { status: null, membershipType: null })).toBe(false);
  });

  it("会員種別を指定したお知らせは、その種別のユーザーだけが対象（種別の無いユーザーは対象外）", () => {
    expect(isAnnouncementTarget(generalOnly, { status: "active", membershipType: "general" })).toBe(
      true
    );
    expect(
      isAnnouncementTarget(generalOnly, { status: "active", membershipType: "community" })
    ).toBe(false);
    expect(isAnnouncementTarget(generalOnly, { status: "active", membershipType: null })).toBe(
      false
    );
  });
});

describe("describeAnnouncementTargets", () => {
  const labels = {
    status: { active: "本登録ユーザー", trial: "お試しユーザー" },
    membership: { community: "コミュニティ会員", general: "一般有料会員" },
  };

  it("対象ステータスと会員種別を表示名で並べる", () => {
    expect(
      describeAnnouncementTargets(
        { target_statuses: ["active", "trial"], target_membership_types: null },
        labels
      )
    ).toBe("本登録ユーザー / お試しユーザー");
    expect(
      describeAnnouncementTargets(
        { target_statuses: ["active"], target_membership_types: ["general", "community"] },
        labels
      )
    ).toBe("本登録ユーザー（一般有料会員・コミュニティ会員）");
  });
});
