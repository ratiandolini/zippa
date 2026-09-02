// SMS — პროვაიდერ-აგნოსტიკური. ცარიელი/LOG => კონსოლში.
import { appUrl } from "@/lib/app-url";

const PROVIDER = (process.env.SMS_PROVIDER || "LOG").toUpperCase();

export interface SmsResult {
  ok: boolean;
  provider: string;
  info?: string;
}

/** E.164-იდან smsoffice-ის ფორმატში (995XXXXXXXXX) */
function toLocalDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function sendViaSmsOffice(to: string, text: string): Promise<SmsResult> {
  const key = process.env.SMSOFFICE_KEY;
  const sender = process.env.SMSOFFICE_SENDER || "Zippa";
  if (!key) return { ok: false, provider: "SMSOFFICE", info: "SMSOFFICE_KEY არ არის" };

  const url = new URL("https://smsoffice.ge/api/v2/send/");
  url.searchParams.set("key", key);
  url.searchParams.set("destination", toLocalDigits(to));
  url.searchParams.set("sender", sender);
  url.searchParams.set("content", text);

  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text();
    return { ok: res.ok, provider: "SMSOFFICE", info: body.slice(0, 200) };
  } catch (e) {
    return { ok: false, provider: "SMSOFFICE", info: e instanceof Error ? e.message : "error" };
  }
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  if (PROVIDER === "SMSOFFICE") return sendViaSmsOffice(to, text);
  // LOG (ნაგულისხმევი)
  if (process.env.NODE_ENV !== "test") console.log(`[SMS→${to}] ${text}`);
  return { ok: true, provider: "LOG" };
}

const APP_URL = appUrl();

/** მოკლე შაბლონები (ქართული = 70 სიმბოლო/სეგმენტი, ვინახავთ მოკლედ) */
export const smsTemplates = {
  onTheWay: (tn: string) =>
    `კურიერი მოდის თქვენს ამანათთან. ტრეკინგი: ${APP_URL}/track/${tn}`,
  delivered: (tn: string) => `ამანათი ${tn} ჩაბარდა. მადლობა, რომ სარგებლობთ ჩვენი სერვისით.`,
  resetCode: (code: string) => `Zippa — პაროლის აღდგენის კოდი — ${code}. მოქმედია 15 წუთი.`,
};
