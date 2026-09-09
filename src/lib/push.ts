import webpush from "web-push";
import { prisma } from "@/lib/db";
import { COMPANY_MAILTO } from "@/lib/company";

// Web Push — VAPID. თუ გასაღებები არ არის, ფუნქცია უბრალოდ არაფერს აკეთებს (არაფერს აზიანებს).

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || COMPANY_MAILTO;

let configured = false;
if (PUB && PRIV) {
  try {
    webpush.setVapidDetails(SUBJECT, PUB, PRIV);
    configured = true;
  } catch {
    configured = false;
  }
}

export const pushConfigured = () => configured;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** ერთ მომხმარებელს — მისი ყველა გამოწერილი მოწყობილობა. ვერასდროს ისვრის შეცდომას. */
export async function sendPush(userId: string, payload: PushPayload) {
  if (!configured) return;
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch {
    return;
  }
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // გამოწერა აღარ არსებობს
      }
    }),
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
  }
}
