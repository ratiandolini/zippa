# განთავსება (Deployment)

საკურიერო პრო — ერთი Next.js აპლიკაცია + PostgreSQL. მთელი სტეკი Docker-შია.

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
git clone https://github.com/YOUR_USERNAME/sakuriero-pro.git /opt/sakuriero
cd /opt/sakuriero
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
cd /opt/sakuriero
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
0 3 * * * cd /opt/sakuriero && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U sakuriero sakuriero | gzip > /opt/backups/skr-$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete
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

## ალტერნატიულ პლატფორმებზე (Railway / Render / Fly.io)

- დაამატე PostgreSQL plugin/addon → აიღე `DATABASE_URL`
- დააყენე იგივე env ცვლადები (`.env.production.example`-დან), `DATABASE_URL`-ის გარდა რასაც პლატფორმა თავად აძლevს
- Build: `npm run build` · Start: `npm run db:deploy && node .next/standalone/server.js` (ან პლატფორმა თავად აღმოაჩენს Dockerfile-ს)
