// ელფოსტა — პროვაიდერ-აგნოსტიკური. ცარიელი/LOG => კონსოლში.
const PROVIDER = (process.env.EMAIL_PROVIDER || "LOG").toUpperCase();
const FROM = process.env.EMAIL_FROM || "Zippa <onboarding@resend.dev>";

// category — Sentry-ში დასალოგებელი უსაფრთხო, არა-მგრმნობიარე სტატუსი.
// არასდროს არ შეიცავს ელფოსტის მისამართს, კოდს, key-ს, ან provider-ის raw pასუხს.
export type EmailFailureCategory =
  | "missing_api_key"
  | "auth_error"
  | "validation_error"
  | "rate_limited"
  | "provider_error"
  | "unknown_http_error"
  | "network_error";

export interface EmailResult {
  ok: boolean;
  provider: string;
  info?: string;
  category?: EmailFailureCategory;
  httpStatus?: number;
}

function categorizeHttpStatus(status: number): EmailFailureCategory {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 400 || status === 422) return "validation_error";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return "unknown_http_error";
}

async function sendViaResend(to: string, subject: string, text: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return { ok: false, provider: "RESEND", info: "RESEND_API_KEY არ არის", category: "missing_api_key" };

  const html = `<div style="font-family:sans-serif;font-size:15px;color:#111"><p>${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .split("\n\n")
    .map((p) => p.replace(/\n/g, "<br/>"))
    .join("</p><p>")}</p><p style="color:#888;font-size:12px">Zippa — საკურიერო სერვისი</p></div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        text,
        html,
        reply_to: process.env.SUPPORT_EMAIL || undefined,
      }),
    });
    const body = await res.text();
    return {
      ok: res.ok,
      provider: "RESEND",
      info: body.slice(0, 200),
      httpStatus: res.status,
      category: res.ok ? undefined : categorizeHttpStatus(res.status),
    };
  } catch (e) {
    return {
      ok: false,
      provider: "RESEND",
      info: e instanceof Error ? e.message : "error",
      category: "network_error",
    };
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  if (PROVIDER === "RESEND") return sendViaResend(to, subject, text);
  // LOG (ნაგულისხმევი) — შიგთავსი (პაროლის აღდგენის კოდის ჩათვლით) მხოლოდ explicit
  // debug რეჟიმში და არასდროს production-ში
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_DEBUG_RESET_CODES === "true"
  ) {
    console.log(`[EMAIL→${to}] ${subject}: ${text}`);
  }
  return { ok: true, provider: "LOG" };
}

export const emailTemplates = {
  resetCode: (code: string) => ({
    subject: "Zippa — პაროლის აღდგენის კოდი",
    text: `თქვენი პაროლის აღდგენის კოდია: ${code}\n\nკოდი მოქმედია 15 წუთი. თუ თქვენ არ მოითხოვეთ პაროლის აღდგენა, უგულებელყავით ეს წერილი.`,
  }),
};
