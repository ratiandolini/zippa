// ტესტის ბაზის მიგრაცია — გაუშვი ერთხელ (ან სქემის ცვლილებისას):  npm run test:db
import { execSync } from "node:child_process";

const url =
  process.env.DATABASE_URL_TEST ||
  "postgresql://sakuriero:sakuriero@localhost:5432/sakuriero_test?schema=public";

// prisma CLI ავტომატურად ტვირთავს root .env-ს და ის აჭარბებს process.env-ს,
// ამიტომ ვქმნით დროებით .env-ს ტესტის ბაზის URL-ით.
import { writeFileSync, rmSync, existsSync, renameSync } from "node:fs";

const hadBackup = existsSync(".env");
if (hadBackup) renameSync(".env", ".env.bak");
writeFileSync(".env", `DATABASE_URL="${url}"\nDIRECT_URL="${url}"\n`);
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
} finally {
  rmSync(".env", { force: true });
  if (hadBackup) renameSync(".env.bak", ".env");
}
