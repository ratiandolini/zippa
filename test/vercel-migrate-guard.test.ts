import { describe, it, expect } from "vitest";
import { shouldRunProductionMigration } from "@/lib/deploy-guard";

describe("Vercel build — prisma migrate deploy გუარდი", () => {
  it("Production build (VERCEL_ENV=production) → migrate უნდა გაეშვას", () => {
    expect(shouldRunProductionMigration({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("Preview build (VERCEL_ENV=preview) → migrate არასდროს არ ეშვება", () => {
    expect(shouldRunProductionMigration({ VERCEL_ENV: "preview" })).toBe(false);
  });

  it("Development build (VERCEL_ENV=development) → migrate არასდროს არ ეშვება", () => {
    expect(shouldRunProductionMigration({ VERCEL_ENV: "development" })).toBe(false);
  });

  it("VERCEL_ENV არაა განსაზღვრული (ლოკალური build) → migrate არასდროს არ ეშვება", () => {
    expect(shouldRunProductionMigration({ VERCEL_ENV: undefined })).toBe(false);
  });

  it("ბუნდოვან/მოულოდნელ მნიშვნელობაზეც (typo, ცარიელი სტრინგი) — fail-safe false", () => {
    expect(shouldRunProductionMigration({ VERCEL_ENV: "Production" })).toBe(false);
    expect(shouldRunProductionMigration({ VERCEL_ENV: "" })).toBe(false);
  });
});
