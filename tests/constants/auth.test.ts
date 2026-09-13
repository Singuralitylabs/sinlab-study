import { describe, expect, it } from "vitest";
import { AUTH_HEADER_NAMES, AUTH_HEADERS } from "@/app/constants/auth";

describe("auth constants", () => {
  it("AUTH_HEADERS が定義されていること", () => {
    expect(AUTH_HEADERS.AUTH_ID).toBe("x-sinlab-auth-id");
    expect(AUTH_HEADERS.USER_ID).toBe("x-sinlab-user-id");
    expect(AUTH_HEADERS.USER_STATUS).toBe("x-sinlab-user-status");
    expect(AUTH_HEADERS.USER_ROLE).toBe("x-sinlab-user-role");
  });

  it("AUTH_HEADER_NAMES がすべてのヘッダー名を含んでいること", () => {
    expect(AUTH_HEADER_NAMES).toEqual([
      "x-sinlab-auth-id",
      "x-sinlab-user-id",
      "x-sinlab-user-status",
      "x-sinlab-user-role",
    ]);
  });
});
