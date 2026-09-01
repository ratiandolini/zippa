// ტესტის ბაზის მიგრაცია — გაუშვი ერთხელ (ან სქემის ცვლილებისას):  npm run test:db
import { execSync } from "node:child_process";

const url =
  process.env.DATABASE_URL_TEST ||
  "postgresql://sakuriero:sakuriero@localhost:5432/sakuriero_test?schema=public";

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
