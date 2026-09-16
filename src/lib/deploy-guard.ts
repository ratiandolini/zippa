/**
 * Preview/Production build-ის მიგრაცია-გუარდი — pure ფუნქცია, ტესტვადი.
 * Vercel ავტომატურად აყენებს VERCEL_ENV-ს build container-ში:
 * "production" | "preview" | "development". `prisma migrate deploy`
 * უნდა გაეშვას მხოლოდ production-ზე — Preview/Production ერთ საზიარო
 * ბაზას იყოფენ, ამიტომ Preview-ის build-ი არასდროს არ უნდა შეცვალოს სქემა.
 */
export function shouldRunProductionMigration(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV === "production";
}
