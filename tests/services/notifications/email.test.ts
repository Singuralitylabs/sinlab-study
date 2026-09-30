import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_SEND_TIMEOUT_MS, RESEND_API_URL } from "@/app/constants/notifications";
import { isEmailConfigured, sendEmail } from "@/app/services/notifications/email";

const API_KEY = "re_test_secret_key";
const content = { to: "user@example.com", subject: "件名", text: "本文", html: "<p>本文</p>" };

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", API_KEY);
  vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isEmailConfigured", () => {
  it("RESEND_API_KEY と EMAIL_FROM_ADDRESS の両方があるときだけ true", () => {
    expect(isEmailConfigured()).toBe(true);
    vi.stubEnv("EMAIL_FROM_ADDRESS", "");
    expect(isEmailConfigured()).toBe(false);
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isEmailConfigured()).toBe(false);
  });
});

describe("sendEmail", () => {
  it("Resend API へ送信元・宛先・件名・テキスト版・HTML版を送り、メッセージidを返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "msg_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(content);

    expect(result).toEqual({ status: "sent", messageId: "msg_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_API_URL);
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(init.body)).toEqual({
      from: "Sinlab Study <noreply@mail.example.com>",
      to: ["user@example.com"],
      subject: "件名",
      text: "本文",
      html: "<p>本文</p>",
    });
  });

  it("fetchにEMAIL_SEND_TIMEOUT_MSのAbortSignalタイムアウトを付与する", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(content);

    expect(timeoutSpy).toHaveBeenCalledWith(EMAIL_SEND_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledWith(
      RESEND_API_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it.each([
    ["RESEND_API_KEY", "RESEND_API_KEY"],
    ["EMAIL_FROM_ADDRESS", "EMAIL_FROM_ADDRESS"],
  ])(
    "%s が未設定のまま呼ばれた場合は送信せず failed を返す（スキップの判定は入口で行う）",
    async (_label, envName) => {
      vi.stubEnv(envName, "");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const result = await sendEmail(content);

      expect(result).toEqual({ status: "failed", error: expect.any(String) });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("非2xxの応答は failed を返し、throwしない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

    const result = await sendEmail(content);

    expect(result).toEqual({ status: "failed", error: expect.stringContaining("422") });
  });

  it("タイムアウト（TimeoutError）で例外が投げられても呼び出し元へ伝播せず failed を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    );

    await expect(sendEmail(content)).resolves.toEqual({
      status: "failed",
      error: expect.stringContaining("TimeoutError"),
    });
  });

  it("失敗時の戻り値・ログに API キーを含めない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await sendEmail(content);

    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(API_KEY);
  });

  it("応答ボディが JSON でなくても送信成功として扱う（メッセージidは null）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error("bad")) })
    );

    await expect(sendEmail(content)).resolves.toEqual({ status: "sent", messageId: null });
  });
});

describe("sendEmail の差出人名（#286）", () => {
  it("渡された差出人名を使い、ヘッダーを壊す文字（改行・<>・引用符）は落とす", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@mail.example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({
      to: "user@example.com",
      subject: "件名",
      text: "本文",
      html: "<p>本文</p>",
      fromName: 'A\r\nBcc: evil@example.com <x> "y"',
    });
    await sendEmail({
      to: "user@example.com",
      subject: "件名",
      text: "本文",
      html: "<p>本文</p>",
      fromName: "新サービス",
    });
    await sendEmail({
      to: "user@example.com",
      subject: "件名",
      text: "本文",
      html: "<p>本文</p>",
      fromName: "<>",
    });

    const froms = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).from as string);
    expect(froms[0]).not.toMatch(/[\r\n"]/);
    expect(froms[0].match(/[<>]/g)).toHaveLength(2);
    expect(froms[0].endsWith(" <noreply@mail.example.com>")).toBe(true);
    expect(froms[0].split("<").length).toBe(2);
    expect(froms[1]).toBe("新サービス <noreply@mail.example.com>");
    expect(froms[2]).toBe("Sinlab Study <noreply@mail.example.com>");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
