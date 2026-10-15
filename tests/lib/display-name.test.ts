import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/app/constants/user";
import { parseDisplayName } from "@/app/lib/display-name";

describe("parseDisplayName", () => {
  it("前後の空白を除いて返す", () => {
    expect(parseDisplayName("  山田 太郎  ")).toEqual({ ok: true, name: "山田 太郎" });
  });

  it("書式文字は除き、それだけなら空として拒否する。ZWJ は他の文字があるとき残す", () => {
    expect(parseDisplayName("\u200B")).toEqual({
      ok: false,
      message: "表示名を入力してください",
    });
    expect(parseDisplayName("\u200B山田\u202E")).toEqual({ ok: true, name: "山田" });
    expect(parseDisplayName("山田\u200B太郎")).toEqual({ ok: true, name: "山田太郎" });
    const family = "👨\u200D👩";
    expect(parseDisplayName(family)).toEqual({ ok: true, name: family });
    expect(parseDisplayName("\u200D")).toEqual({
      ok: false,
      message: "表示名を入力してください",
    });
  });

  it("サロゲートペアは1文字として数え、上限ちょうどを許可する", () => {
    const name = `${"あ".repeat(DISPLAY_NAME_MAX_LENGTH - 1)}😀`;
    expect([...name].length).toBe(DISPLAY_NAME_MAX_LENGTH);
    expect(parseDisplayName(name)).toEqual({ ok: true, name });
  });

  it.each([
    ["空", "", "表示名を入力してください"],
    ["空白のみ", " 　\n ", "表示名を入力してください"],
    [
      "上限超え",
      "あ".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`,
    ],
    ["改行", "山田\n太郎", "表示名に改行などの制御文字は使えません"],
    ["タブ", "山\t田", "表示名に改行などの制御文字は使えません"],
    ["NUL", "山\u0000田", "表示名に改行などの制御文字は使えません"],
    ["行区切り", "山\u2028田", "表示名に改行などの制御文字は使えません"],
  ])("%s は画面と同じ文言で拒否する", (_label, raw, message) => {
    expect(parseDisplayName(raw)).toEqual({ ok: false, message });
  });
});
