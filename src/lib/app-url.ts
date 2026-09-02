/**
 * აპლიკაციის საჯარო URL — მხოლოდ სერვერზე გამოიყენება (metadata, SMS-ლინკები).
 * პრიორიტეტი: APP_URL env → Vercel-ის ავტომატური URL → localhost.
 */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
