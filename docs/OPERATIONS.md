# Zippa — ოპერაციული სახელმძღვანელო (Operations)

მოკლე, პრაქტიკული ცნობარი: deploy, მიგრაცია, healthcheck, backup/restore და
ინციდენტზე რეაგირება. დაკავშირებული: [DEPLOY.md](../DEPLOY.md), [BACKUP.md](../BACKUP.md).

გარემო (live): **Vercel** (რეგიონი `fra1`) + **Neon Postgres** (`eu-central-1`).
დომენი: https://zippa-eosin.vercel.app

---

## 1. Deploy და მიგრაცია

| ნაბიჯი | ბრძანება / ადგილი |
|---|---|
| Deploy | `git push` main-ზე → Vercel ავტომ. აშენებს |
| Build command | `npm run build:vercel` = `prisma generate && prisma migrate deploy && next build` (`vercel.json`) |
| მიგრაცია | ავტომ. ხდება build-ის დროს (`prisma migrate deploy`). ახალი მიგრაცია: ლოკალურად `npx prisma migrate dev --name <აღწერა>`, შემდეგ commit |
| Rollback (კოდი) | Vercel dashboard → Deployments → წინა deploy → "Promote to Production" |
| Rollback (მიგრაცია) | **ავტომ. rollback არ არის.** წინ-გამსწორებელი (forward-fix) მიგრაცია დაწერე ან აღადგინე ბაზა backup-იდან (იხ. §4) |

**წესი:** მიგრაცია, რომელიც შლის სვეტს/ცხრილს ან ცვლის ტიპს — ჯერ deploy ორ ეტაპად
(1. კოდი აღარ იყენებს ველს → 2. მიგრაცია შლის), რომ deploy-ის დროს ძველი ინსტანსი არ ჩავარდეს.

### ტესტის ბაზის სინქრონი
სქემის ცვლილების შემდეგ: `npm run test:db` (ახლდება `sakuriero_test`).

---

## 2. Healthcheck და მონიტორინგი

| რა | სად |
|---|---|
| App + DB healthcheck | `GET /api/health` → `200 {"status":"ok"}` / `503 {"status":"db_error"}` |
| სწრაფი შემოწმება | `curl -sS -o /dev/null -w "%{http_code}\n" https://zippa-eosin.vercel.app/api/health` |
| შეცდომების ლოგი | Vercel dashboard → Project → Logs (Runtime Logs) |
| Sentry | თუ `SENTRY_DSN` დაყენებულია — server-side exception-ები იქ ჩანს |

**გასაკეთებელი (ჯერ არ არის):** გარე uptime-მონიტორი (მაგ. UptimeRobot / BetterStack —
უფასო ტარიფი) `/api/health`-ზე, 1–5 წთ ინტერვალით, alert ელფოსტაზე/SMS-ზე.

---

## 3. Cron

| job | schedule | დაცვა |
|---|---|---|
| `/api/cron/expire-assignments` | `0 3 * * *` (`vercel.json`) | `CRON_SECRET` (Vercel Cron ავტომ. აგზავნის). secret-ის გარეშე endpoint **დაკეტილია** (503) |

ხელით: `curl "https://.../api/cron/expire-assignments?token=$CRON_SECRET"`

---

## 4. Backup და აღდგენა

### რა გვაქვს
1. **GitHub Actions workflow** — `.github/workflows/db-backup.yml` (repo-ში tracked-ია,
   commit `9bd9176`).
   - განრიგი: `cron: "0 3 * * *"` — ყოველ დღე **03:00 UTC** (07:00 თბილისში); აგრეთვე
     `workflow_dispatch` (ხელით გაშვება Actions ტაბიდან).
   - აკეთებს: `postgresql-client-16` → `pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip`
     → `actions/upload-artifact` (სახელი `db-backup`, **retention 90 დღე**).
   - **მოითხოვს repo secret `DATABASE_URL` = Neon DIRECT string.** secret-ის გარეშე job
     ვარდება (`test -n "$DATABASE_URL" || exit 1`) — ე.ი. სანამ secret არ დაყენდა,
     ავტომატური backup **ფაქტობრივად არ მუშაობს**. ამის გადამოწმება: GitHub → Actions →
     "DB Backup" — ბოლო run მწვანეა თუ არა.
   - ⚠️ artifact-ები **მხოლოდ GitHub-ზეა**, offsite ასლი არ არსებობს, retention 90 დღე.
2. **Neon-ის ისტორია** — Free ტარიფზე point-in-time restore ფანჯარა ~24 სთ.
3. **ხელით** — `DATABASE_URL="postgres://…direct…" ./scripts/db-backup.sh ./backups`

### აღდგენა backup-იდან
```bash
# 1. ჩამოტვირთე უახლესი არტიფაქტი: GitHub → Actions → "DB Backup" → run → Artifacts
# 2. ახალ Neon branch-ზე აღდგენა (prod-ს არ ვეხებით)
gunzip -c zippa-2026-09-10_0300.sql.gz | psql "$NEON_BRANCH_DIRECT_URL"
# 3. შემოწმების შემდეგ — Vercel env-ში გადაამისამართე DATABASE_URL/DIRECT_URL ახალ branch-ზე
```

### აღდგენა Neon PITR-ით (ბოლო 24 სთ)
Neon dashboard → Project → Branches → "Restore" → აირჩიე დრო → შექმენი branch →
გადაამისამართე Vercel env.

### გასაკეთებელი რეალურ გაშვებამდე (კონფიგურაცია, არა კოდი)
- [ ] GitHub repo secret `DATABASE_URL` (Neon **DIRECT**) დაყენება + workflow-ის ერთი ხელით გაშვება ტესტად
- [ ] Neon **ფასიან ტარიფზე** გადასვლა → PITR 7–30 დღე (Free-ის 24 სთ არასაკმარისია)
- [ ] Backup-ის ასლი offsite (S3 / Cloudflare R2) — GitHub artifact-ის 90-დღიან ლიმიტს გასცდეს
- [ ] აღდგენის სავარჯიშო (restore drill) — ერთხელ ჩაატარე ბოლომდე, დააფიქსირე დრო

---

## 5. Secret-ები (Vercel → Settings → Environment Variables)

| ცვლადი | დანიშნულება |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Neon (pooled / direct) |
| `AUTH_SECRET` | JWT ხელმოწერა (≥32 სიმბ.) |
| `CRON_SECRET` | cron endpoint-ის დაცვა (გარეშე — `/api/cron/*` აბრუნებს 503) |
| `PROOF_BLOB_READ_WRITE_TOKEN` | **მიტანის ფოტოს** private Vercel Blob store-ის RW token. გარეშე — production-ში ფოტოს ატვირთვა ჩერდება (public-ზე fallback აკრძალულია). ცალკე private store შექმენი Vercel dashboard-ში |
| `BLOB_READ_WRITE_TOKEN` | (არჩევითი) სხვა/legacy public Blob store |
| `ADMIN_EMAIL` / `ADMIN_PHONE` / `ADMIN_PASSWORD` | პირველი დისპეჩერი (`/api/setup`). **პირველი შესვლის შემდეგ პაროლი შეცვალე და env-იდან წაშალე** |
| `SMS_PROVIDER` / `SMSOFFICE_KEY` | SMS. `LOG` = არსად არ ლოგდება |
| `SENTRY_DSN` | (არჩევითი) შეცდომების მონიტორინგი |
| `AUTH_DEBUG_RESET_CODES` | **production-ში არ დააყენო** — მხოლოდ dev-ში აჩენს reset-კოდს კონსოლში |

Secret-ის როტაცია: `AUTH_SECRET`-ის შეცვლა ყველა სესიას წყვეტს (მომხმარებლები თავიდან შედიან).

---

## 6. ინციდენტზე რეაგირება (მოკლე გეგმა)

| სიმპტომი | პირველი ნაბიჯები |
|---|---|
| საიტი 500 / არ იხსნება | Vercel → Logs. თუ ბოლო deploy-ის მერე — "Promote" წინა deploy-ზე (rollback). `/api/health` შეამოწმე |
| `/api/health` → 503 | Neon dashboard → Operations/Status. Neon Free ავტო-პაუზა → პირველი მოთხოვნა აღადგენს. თუ არა — Neon support / restore branch |
| მონაცემები დაზიანდა / წაიშალა | **არ შეეხო prod-ს.** Neon-ზე შექმენი restore branch (PITR ან backup-იდან), შეამოწმე, მერე გადაამისამართე |
| ფინანსური რიცხვები არ ჯდება | `CodRemittance` / `DriverEarning` / `Payout` ცხრილები + `order-financial-cycle.test.ts` ლოგიკა. ხელით შესწორება — Neon SQL editor, ჯერ backup |
| ეჭვი უსაფრთხოების დარღვევაზე | `AUTH_SECRET` შეცვალე (ყველა სესია წყდება) → `User.tokenVersion` ისედაც იზრდება პაროლის ცვლილებაზე. Vercel Logs-ში საეჭვო IP/მოთხოვნები |
| Blob ფოტოები მიუწვდომელია | `PROOF_BLOB_READ_WRITE_TOKEN` შეამოწმე. ატვირთვა 503-ს აბრუნებს token-ის გარეშე. ფოტო არა-კრიტიკულია — მიტანა PIN-ითაც დასტურდება |

**კონტაქტები:** Neon / Vercel dashboard-ის ანგარიში — `ratiandolini@gmail.com`.

---

## 7. ცნობილი შეზღუდვები

- Rate-limit — PostgreSQL (`RateLimit` ცხრილი), ყველა ინსტანსზე საერთო. DB-ის ჩავარდნისას
  → მკაცრი per-instance in-memory fallback (**არასდროს unlimited**).
- მიტანის ფოტო — private Vercel Blob (`PROOF_BLOB_READ_WRITE_TOKEN`). ნედლი blob URL არსად
  არ ქვეყნდება; წვდომა მხოლოდ `/api/orders/[id]/photo`-ით (role/owner check). public fallback აკრძალული.
- ავტომატური backup მუშაობს **მხოლოდ** თუ GitHub secret `DATABASE_URL` დაყენებულია (იხ. §4).
- Nominatim (მისამართის ავტოშევსება) — საჯარო სერვერი, ~1 req/წმ. დიდ ტრაფიკზე საკუთარი instance.
- გადახდა — `MOCK` რეჟიმში (ონლაინ ბარათი არ მუშაობს; COD/ნაღდი მუშაობს).
