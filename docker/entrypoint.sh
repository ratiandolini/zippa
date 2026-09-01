#!/bin/sh
set -e

echo "→ ბაზის მიგრაცია (prisma migrate deploy)…"
./node_modules/.bin/prisma migrate deploy

# საწყისი მონაცემები — მხოლოდ თუ ცხადად ითხოვ (SEED_ON_START=true)
if [ "$SEED_ON_START" = "true" ]; then
  echo "→ საწყისი მონაცემების ჩატვირთვა (seed)…"
  ./node_modules/.bin/tsx prisma/seed.ts || echo "seed გამოტოვდა"
fi

echo "→ აპლიკაციის გაშვება…"
exec "$@"
