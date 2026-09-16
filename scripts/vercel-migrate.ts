// build:vercel-ის ერთადერთი მიგრაცია-გუარდი. იხ. src/lib/deploy-guard.ts pure
// ლოგიკისთვის (ტესტირებულია test/vercel-migrate-guard.test.ts-ში). ეს ფაილი
// მხოლოდ CLI-ის entry-ია — არსად არ არის იმპორტირებული აპლიკაციის კოდიდან.
import { execSync } from "node:child_process";
import { shouldRunProductionMigration } from "../src/lib/deploy-guard";

if (shouldRunProductionMigration(process.env)) {
  console.log(`[vercel-migrate] VERCEL_ENV=${process.env.VERCEL_ENV} — running prisma migrate deploy`);
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(
    `[vercel-migrate] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"} — skipping prisma migrate deploy ` +
      "(Preview/local build; migrations only run for an explicit Production deployment)",
  );
}
