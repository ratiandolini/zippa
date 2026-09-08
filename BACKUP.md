# ბაზის ბექაფი

მონაცემები (შეკვეთები, ფინანსები, მომხმარებლები) ინახება Neon-ზე. Neon-ის უფასო
ტარიფზე history შეზღუდულია, ამიტომ საჭიროა დამოუკიდებელი ბექაფი.

## 1. ავტომატური — GitHub Actions (რეკომენდებული, უფასო)

ფაილი: `.github/workflows/db-backup.yml`. ყოველ დღე 03:00 UTC აკეთებს `pg_dump`-ს
და ინახავს არტიფაქტად (90 დღე).

**გასააქტიურებლად:**

1. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
2. სახელი: `DATABASE_URL`
   მნიშვნელობა: Neon-ის **DIRECT** connection string (არა pooled — pooled-ზე
   `pg_dump` ვერ იმუშავებს). Neon dashboard → Connection Details → „Direct connection".
3. Actions ტაბზე → „DB Backup" → „Run workflow" — ერთხელ ხელით გაუშვი შესამოწმებლად.

**ჩამოტვირთვა:** Actions → კონკრეტული run → Artifacts → `db-backup`.

## 2. ხელით / ლოკალურად

```bash
DATABASE_URL="postgres://...direct..." ./scripts/db-backup.sh ./backups
```

საჭიროა `pg_dump` (PostgreSQL client). `backups/` gitignore-შია.

## აღდგენა

```bash
gunzip -c zippa-2026-09-08_0300.sql.gz | psql "$DATABASE_URL"
```

ან ახალ Neon branch-ზე, სანამ prod-ს გადააწერ.

## რჩევა

- გაშვების შემდეგ, თუ ტრაფიკი გაიზრდება — გადადი Neon-ის ფასიან ტარიფზე
  (point-in-time restore) და/ან დაამატე ბექაფის ატვირთვა S3/R2-ზე.
