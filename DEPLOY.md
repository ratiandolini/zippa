# განთავსება (Deployment)

Zippa — ერთი Next.js აპლიკაცია + PostgreSQL. მთელი სტეკი Docker-შია.

## რა გჭირდება

1. **VPS** — Ubuntu 22.04+, მინ. 2 vCPU / 4 GB RAM / 40 GB SSD (~$20–40/თვე: Hetzner, DigitalOcean, Contabo, Time4VPS)
2. **დომენი** — `.ge` ან `.com`. A-ჩანაწერი მიმართე VPS-ის IP-ზე (`@` და `www`)
3. SSH წვდომა VPS-ზე

## 1. სერვერის მომზადება

```bash
ssh root@SERVER_IP

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# firewall
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. კოდის ატანა

```bash
git clone https://github.com/YOUR_USERNAME/zippa.git /opt/zippa
cd /opt/zippa
```

## 3. კონფიგურაცია

```bash
cp .env.production.example .env
nano .env
```

აუცილებლად შეავსე:

| ცვლადი | როგორ |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `DOMAIN` | `sakuriero.ge` (შენი დომენი, `https://` გარეშე) |
| `TLS_EMAIL` | შენი ელფოსტა (Let's Encrypt-ისთვის) |
| `NEXT_PUBLIC_APP_URL` | `https://sakuriero.ge` |
| `ADMIN_EMAIL` / `ADMIN_PHONE` / `ADMIN_PASSWORD` | პირველი დისპეჩერის ანგარიში |

## 4. გაშვება

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

პირველ გაშვებაზე ავტომატურად:
- ბაზის მიგრაცია (`prisma migrate deploy`)
- ქალაქები + ტარიფები + დისპეჩერი (`SEED_ON_START=true`)
- Caddy იღებს SSL სერტიფიკატს Let's Encrypt-იდან (1–2 წუთი)

შემოწმება:
```bash
docker compose -f docker-compose.prod.yml ps
curl -I https://sakuriero.ge/api/health   # → 200
```

გახსენი `https://sakuriero.ge` და შედი დისპეჩერის ანგარიშით. **პაროლი მაშინვე შეცვალე** (პარამეტრები → პაროლის შეცვლა). `.env`-ში `SEED_ON_START=false` დააყენე.

## 5. განახლება

```bash
cd /opt/zippa
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

მიგრაციები ავტომატურად გაეშვება.

## 6. ბექაპი (ბაზა)

```bash
# ხელით
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U sakuriero sakuriero | gzip > backup-$(date +%F).sql.gz

# ყოველდღიური cron (root crontab -e)
0 3 * * * cd /opt/zippa && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U sakuriero sakuriero | gzip > /opt/backups/skr-$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete
```

აღდგენა:
```bash
gunzip -c backup-2026-09-01.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U sakuriero sakuriero
```

## 7. SMS-ის ჩართვა (პროდაქშენში)

1. დარეგისტრირდი [smsoffice.ge](https://smsoffice.ge)-ზე, აიღე API key და დაამტკიცე sender name
2. `.env`: `SMS_PROVIDER=SMSOFFICE`, `SMSOFFICE_KEY=...`, `SMSOFFICE_SENDER=...`
3. `docker compose -f docker-compose.prod.yml up -d`

---

## ლოგები / დიაგნოსტიკა

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f caddy    # SSL პრობლემები
```

## შენიშვნები

- **Nominatim** (მისამართის ავტოშევსება) ახლა საჯარო სერვერს იყენებს — ლიმიტი 1 მოთხოვნა/წმ. დიდი ტრაფიკისას [საკუთარი Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/) ან [Geoapify/LocationIQ](https://locationiq.com) გჭირდება.
- Rate limiting ამჟამად in-memory-ია (ერთი კონტეინერისთვის). მრავალინსტანსზე გადასვლისას Redis.
- ალტერნატივები VPS-ის ნაცვლად: **Railway** / **Render** (managed Postgres, git push deploy) — უფრო მარტივი, ოდნავ ძვირი. იგივე Dockerfile მუშაობს.

---

# უფასო გაშვება: Vercel + Neon (ტესტ-რეჟიმი)

საჩვენებლად და ტესტისთვის — $0. (რეალური ბიზნესისთვის VPS სჯობს.)

## 1. ბაზა — Neon

1. [neon.tech](https://neon.tech) → ახალი პროექტი, რეგიონი **Frankfurt (eu-central-1)**
2. Dashboard → Connection string. აიღე **ორივე**:
   - **Pooled** (შეიცავს `-pooler`-ს) → ეს იქნება `DATABASE_URL`
   - **Direct** (pooler-ის გარეშე) → ეს იქნება `DIRECT_URL`

## 2. კოდი — GitHub

```bash
git push   # კოდი GitHub-ზე უნდა იყოს
```

## 3. Vercel

1. [vercel.com](https://vercel.com) → Add New Project → აირჩიე რეპო
2. Framework: **Next.js** (თავად ამოიცნობს). Build command უკვე გაწერილია `vercel.json`-ში
3. **Environment Variables** (Settings → Environment Variables):

| ცვლადი | მნიშვნელობა |
|---|---|
| `DATABASE_URL` | Neon-ის **pooled** connection string |
| `DIRECT_URL` | Neon-ის **direct** connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (Deploy-ის შემდეგ განაახლე რეალურით) |
| `SMS_PROVIDER` | `LOG` |
| `ADMIN_EMAIL` / `ADMIN_PHONE` / `ADMIN_PASSWORD` | პირველი დისპეჩერი |
| `ADMIN_NAME` | დისპეჩერი |

4. **Deploy**. Build ავტომატურად გაატარებს მიგრაციებს (`prisma migrate deploy`)

## 4. საწყისი მონაცემები (ერთხელ)

Deploy-ის შემდეგ, ლოკალურ მანქანაზე:

```bash
# .env-ში დროებით ჩასვი Neon-ის URL-ები, მერე:
NODE_ENV=production npx tsx prisma/seed.ts
```

ეს დაამატებს ქალაქებს, ტარიფებს და დისპეჩერს (`ADMIN_*`-იდან). **უსაფრთხოა ხელახლა გაშვება** — არსებულს არ შლის.

შედი დისპეჩერის ანგარიშით, **პაროლი შეცვალე**.

## შეზღუდვები

- Neon უფასო: 0.5 GB, ავტო-პაუზა უმოქმედობისას (პირველი მოთხოვნა ~1 წმ ნელი)
- Vercel უფასო (Hobby): ტექნიკურად არაკომერციული; ცივი სტარტები
- **რეალური კლიენტებისთვის** — გადადი VPS-ზე (ზემოთ) ან Vercel Pro + Neon-ის ფასიან ტარიფზე

## სხვა პლატფორმები (Railway / Render / Fly.io)

იგივე პრინციპი — Postgres addon → `DATABASE_URL`/`DIRECT_URL`, იგივе env, Build: `npm run build:vercel`.
