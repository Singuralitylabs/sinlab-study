import { describe, expect, it } from "vitest";
import { parseVideoSource, toStreamVideoUid } from "@/app/lib/video-source";

const UID = "0123456789abcdef0123456789abcdef";

describe("toStreamVideoUid", () => {
  it("32桁の16進数を受け付け、前後の空白と大文字を正規化する", () => {
    expect(toStreamVideoUid(UID)).toBe(UID);
    expect(toStreamVideoUid(`  ${UID.toUpperCase()}\n`)).toBe(UID);
  });

  it.each([null, undefined, "", "abc", `${UID}0`, "g".repeat(32)])("%s は null", (v) => {
    expect(toStreamVideoUid(v)).toBeNull();
  });
});

describe("parseVideoSource", () => {
  it("Stream UID は stream", () => {
    expect(parseVideoSource(UID)).toEqual({ kind: "stream", uid: UID });
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ/",
  ])("YouTube URL %s は youtube", (url) => {
    expect(parseVideoSource(url)).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  it.each([
    "https://example.com/video.mp4",
    "javascript:alert(1)//youtu.be/abc",
    "evil.com/youtu.be/abc",
    "",
    null,
  ])("%s は null", (v) => {
    expect(parseVideoSource(v)).toBeNull();
  });
});
