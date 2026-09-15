import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb, call, makeUser } from "./helpers";

// email/SMS/Sentry ცალკე ფაილში mock-ირდება, რომ auth.test.ts-ის
// არსებული (LOG-provider) ტესტები არ დაზარალდეს.
// vi.mock ჰოისტდება ფაილის თავში — ცვლადები vi.hoisted-ით უნდა შეიქმნას.
const { sendEmailMock, captureMessageMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
  emailTemplates: { resetCode: (code: string) => ({ subject: "s", text: `code:${code}` }) },
}));
vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ ok: true })),
  smsTemplates: { resetCode: (code: string) => `sms:${code}` },
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: captureMessageMock,
  captureException: vi.fn(),
}));

import { POST as forgot } from "@/app/api/auth/forgot/route";

beforeEach(() => {
  sendEmailMock.mockReset();
  captureMessageMock.mockReset();
});
beforeEach(resetDb);

describe("POST /api/auth/forgot — ელფოსტის გაგზავნის დაკვირვება (observability)", () => {
  it("წარმატებული გაგზავნისას Sentry არ იძახება, კლიენტს იგივე {ok:true}", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, provider: "RESEND" });
    const u = await makeUser("CUSTOMER", { phone: "+995599111222" });

    const r = await call(forgot, { body: { emailOrPhone: u.email } });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("ჩავარდნისას captureMessage იძახება მხოლოდ safe ტეგებით — არასდროს ელფოსტა/კოდი/raw პასუხი", async () => {
    sendEmailMock.mockResolvedValue({
      ok: false,
      provider: "RESEND",
      category: "auth_error",
      httpStatus: 401,
      info: "raw provider response body that must never be logged",
    });
    const u = await makeUser("CUSTOMER", { phone: "+995599111333" });

    const r = await call(forgot, { body: { emailOrPhone: u.email } });

    // კლიენტის პასუხი უცვლელი — გაჟონვის/სტატუსის მინიშნების გარეშე
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [message, context] = captureMessageMock.mock.calls[0];
    expect(message).toBe("password-reset email send failed");
    expect(context.tags).toEqual({ email_provider: "RESEND", email_failure_category: "auth_error" });

    const serialized = JSON.stringify(captureMessageMock.mock.calls[0]);
    expect(serialized).not.toContain(u.email);
    expect(serialized).not.toContain("raw provider response body");
  });

  it("კატეგორიის არარსებობისას 'unknown'-ზე გადადის, არ ვარდება", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, provider: "LOG" });
    const u = await makeUser("CUSTOMER", { phone: "+995599111444" });

    const r = await call(forgot, { body: { emailOrPhone: u.email } });

    expect(r.status).toBe(200);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [, context] = captureMessageMock.mock.calls[0];
    expect(context.tags).toEqual({ email_provider: "LOG", email_failure_category: "unknown" });
  });

  it("არასებული მომხმარებელი — sendEmail არც გამოძახებულა, Sentry არც", async () => {
    const r = await call(forgot, { body: { emailOrPhone: "ghost-observability@test.ge" } });

    expect(r.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});
