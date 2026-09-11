// ეს ფაილი სრულდება ტესტ-ფაილების იმპორტამდე — აქ ვაყენებთ ტესტის გარემოს
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  "postgresql://sakuriero:sakuriero@localhost:5432/sakuriero_test?schema=public";
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long-000000";
process.env.AUTH_COOKIE_NAME = "skr_session";
process.env.SMS_PROVIDER = "LOG";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
// ახალი ფუნქციები ტესტებში ჩართული — production-ში default false (lib/flags.ts)
process.env.NEXT_PUBLIC_PARTNER_ONBOARDING_ENABLED = "true";
process.env.NEXT_PUBLIC_DRIVER_VERIFICATION_ENABLED = "true";
// NODE_ENV=test-ს vitest თავად აყენებს
