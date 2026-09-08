#!/usr/bin/env bash
# ლოკალური / ხელით ბექაფი. გამოყენება:
#   DATABASE_URL="postgres://...direct..." ./scripts/db-backup.sh [გამოსატანი-საქაღალდე]
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL საჭიროა (Neon-ის DIRECT_URL)}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

STAMP=$(date -u +%Y-%m-%d_%H%M)
FILE="$OUT_DIR/zippa-$STAMP.sql.gz"

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"
echo "შენახულია: $FILE ($(du -h "$FILE" | cut -f1))"

# ძველი ბექაფების გასუფთავება — ბოლო 14
ls -1t "$OUT_DIR"/zippa-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -v
