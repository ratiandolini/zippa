# Zippa

საკურიერო სერვისის მართვის ვებ-პლატფორმა — მთელი საქართველოს მასშტაბით.
სამი როლი: **მომხმარებელი**, **კურიერი**, **დისპეჩერი**.

## ტექნოლოგიები

ერთი ენა, ერთი აპლიკაცია (მარტივი მხარდაჭერა და დეპლოი):

- **Next.js 14** (App Router) — frontend + API route handlers
- **PostgreSQL + Prisma** — ბაზა
- **Tailwind CSS** — მინიმალისტური UI
- **JWT (jose) + httpOnly cookie** — ავტორიზაცია
- **Leaflet + OpenStreetMap / OSRM** — რუკა და მარშრუტი (უფასო)
- გადახდა — პროვაიდერ-აგნოსტიკური (BOG / TBC / mock)

## ლოკალური გაშვება

```bash
cp .env.example .env          # შეავსე AUTH_SECRET
docker compose up -d          # Postgres
npm install
npm run db:migrate            # ბაზის სქემა
npm run db:seed               # სატესტო მონაცემები
npm run dev                   # http://localhost:3000
```

### სატესტო ანგარიშები (seed-ის შემდეგ)

| როლი | ელფოსტა | პაროლი |
|---|---|---|
| დისპეჩერი | dispatch@sakuriero.ge | password123 |
| მომხმარებელი | customer@sakuriero.ge | password123 |
| კურიერი | driver@sakuriero.ge | password123 |

## სტრუქტურა

```
prisma/schema.prisma   — მონაცემთა მოდელი
src/middleware.ts       — როლებზე დაფუძნებული მარშრუტების დაცვა
src/lib/                — db, auth, domain helpers
src/app/(marketing)/    — საჯარო გვერდები
src/app/(auth)/         — login / register
src/app/app/            — მომხმარებლის პანელი
src/app/driver/         — კურიერის პანელი
src/app/dispatch/       — დისპეჩერის პანელი
src/app/api/            — REST API
_legacy/                — ძველი Quarkus პროტოტიპი (აღარ გამოიყენება)
```
