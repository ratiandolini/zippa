# ტესტები

Vitest + ცალკე Postgres ბაზა (`sakuriero_test`).

## ერთჯერადი მომზადება

```bash
# შექმენი ტესტის ბაზა (ერთხელ)
createdb sakuriero_test   # ან: psql -c "CREATE DATABASE sakuriero_test OWNER sakuriero"

# გაატარე მიგრაციები
npm run test:db
```

სქემის ცვლილებისას ხელახლა: `npm run test:db`.

## გაშვება

```bash
npm test           # ერთჯერ
npm run test:watch # watch რეჟიმი
```

## რას ფარავს

| ფაილი | |
|---|---|
| `pricing.test.ts` | ფასის ძრავა — ზონა, წონა-კალათა, codFee, კურიერის წილი, 16:00 წესი |
| `auth.test.ts` | რეგისტრაცია, შესვლა, პაროლის ცვლა/აღდგენა, rate-limit |
| `orders.test.ts` | სტატუსების მანქანა, წვდომები, მინიჭება, ჩაბარებისას ფინანსური აღრიცხვა |
| `payout.test.ts` | ანაზღაურების გადახდა, ნაღდის ჩაბარება, ლიმიტები |
| `pricing-rules.test.ts` | დისპეჩერის ტარიფის რედაქტორი → quote |

`test/helpers.ts` — `resetDb()`, factory-ები, `call()` (route handler-ის პირდაპირ გამოძახება), `actAs()` (სესიის mock).
