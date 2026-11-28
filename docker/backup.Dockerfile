# syntax=docker/dockerfile:1
#
# Optional encrypted PostgreSQL backup sidecar.
#
# The image is deliberately tiny: the official PostgreSQL client plus OpenSSL.
# It takes a custom-format `pg_dump`, encrypts it with AES-256-CBC (PBKDF2,
# 200k iterations), verifies the round-trip checksum, writes a checksum file,
# and prunes dumps older than the retention window. No secret is baked into the
# image; the passphrase and database credentials arrive as environment
# variables from the Compose `.env` file or the buyer's secret manager.

FROM postgres:19-alpine

RUN apk add --no-cache openssl

RUN mkdir -p /backups && chown postgres:postgres /backups

RUN cat > /usr/local/bin/backup-entrypoint <<'SCRIPT'
#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required; generate one with openssl rand -base64 32}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-900}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  base="workshop-pos-$timestamp"
  plain="$BACKUP_DIR/$base.dump"
  partial="$BACKUP_DIR/.$base.dump.enc.partial"
  restored="$BACKUP_DIR/.$base.verify.dump"
  encrypted="$BACKUP_DIR/$base.dump.enc"

  trap 'rm -f "$plain" "$partial" "$restored"' EXIT HUP INT TERM

  printf 'backup start: %s\n' "$timestamp"
  pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$plain"

  checksum="$(sha256sum "$plain" | awk '{ print $1 }')"

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
    -in "$plain" -out "$partial" -pass env:BACKUP_PASSPHRASE

  # Prove the ciphertext decrypts to the exact dump before deleting plaintext.
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$partial" -out "$restored" -pass env:BACKUP_PASSPHRASE
  printf '%s  %s\n' "$checksum" "$restored" | sha256sum -c - >/dev/null

  mv "$partial" "$encrypted"
  rm -f "$plain" "$restored"
  printf '%s  %s\n' "$checksum" "$(basename "$encrypted")" > "$encrypted.sha256"

  printf 'backup ok: %s (%s bytes, sha256 %s)\n' \
    "$(basename "$encrypted")" "$(wc -c < "$encrypted")" "$checksum"

  find "$BACKUP_DIR" -type f -name 'workshop-pos-*.dump.enc' -mtime +"$RETENTION_DAYS" -print -delete
  find "$BACKUP_DIR" -type f -name 'workshop-pos-*.dump.enc.sha256' -mtime +"$RETENTION_DAYS" -print -delete

  trap - EXIT HUP INT TERM
}

if [ "${1:-loop}" = "backup-once" ]; then
  run_backup
  exit 0
fi

while true; do
  if ! run_backup; then
    printf 'backup failed; exiting so the restart policy retries\n' >&2
    exit 1
  fi
  sleep "$INTERVAL_SECONDS"
done
SCRIPT

RUN chmod 0755 /usr/local/bin/backup-entrypoint

USER postgres

ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
