import { describe, expect, it } from "vitest";
import {
  checkAdminPermissions,
  checkContentPermissions,
  checkInstructorPermissions,
} from "@/app/services/auth/permissions";

describe("checkAdminPermissions", () => {
  it("admin ロールは true を返す", () => {
    expect(checkAdminPermissions("admin")).toBe(true);
  });

  it("maintainer ロールは false を返す", () => {
    expect(checkAdminPermissions("maintainer")).toBe(false);
  });

  it("member ロールは false を返す", () => {
    expect(checkAdminPermissions("member")).toBe(false);
  });

  it("未知のロールは false を返す", () => {
    expect(checkAdminPermissions("unknown")).toBe(false);
  });
});

describe("checkContentPermissions", () => {
  it("admin ロールは true を返す", () => {
    expect(checkContentPermissions("admin")).toBe(true);
  });

  it("maintainer ロールは true を返す", () => {
    expect(checkContentPermissions("maintainer")).toBe(true);
  });

  it("member ロールは false を返す", () => {
    expect(checkContentPermissions("member")).toBe(false);
  });

  it("未知のロールは false を返す", () => {
    expect(checkContentPermissions("unknown")).toBe(false);
  });
});

describe("checkInstructorPermissions", () => {
  it("admin ロールは true を返す", () => {
    expect(checkInstructorPermissions("admin")).toBe(true);
  });

  it("maintainer ロールは true を返す", () => {
    expect(checkInstructorPermissions("maintainer")).toBe(true);
  });

  it("member ロールは false を返す", () => {
    expect(checkInstructorPermissions("member")).toBe(false);
  });

  it("未知のロールは false を返す", () => {
    expect(checkInstructorPermissions("unknown")).toBe(false);
  });
});
