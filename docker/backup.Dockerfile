# syntax=docker/dockerfile:1
#
# Optional encrypted PostgreSQL backup sidecar.
#
# The image is deliberately small: the official PostgreSQL client, OpenSSL, and
# bash for a strict streaming pipeline. A custom-format `pg_dump` is streamed
# through `tee` into `sha256sum` and AES-256-CBC (PBKDF2, 200k iterations), so
# no plaintext dump is ever written to disk. The ciphertext is decrypted again
# and hashed before it replaces the partial file; a failed dump, encrypt, or
# checksum aborts the run. Old encrypted dumps are pruned by retention. No
# secret is baked into the image; the passphrase and database credentials come
# from the environment or a mounted secret file.

FROM postgres:19-alpine

RUN apk add --no-cache openssl bash

RUN mkdir -p /backups && chown postgres:postgres /backups

RUN cat > /usr/local/bin/backup-entrypoint <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  [ -r "$BACKUP_PASSPHRASE_FILE" ] ||
    { printf 'BACKUP_PASSPHRASE_FILE is not readable\n' >&2; exit 1; }
  [ -s "$BACKUP_PASSPHRASE_FILE" ] && grep -q '[^[:space:]]' "$BACKUP_PASSPHRASE_FILE" ||
    { printf 'BACKUP_PASSPHRASE_FILE is empty\n' >&2; exit 1; }
  PASS_ARG="file:$BACKUP_PASSPHRASE_FILE"
  PASS_VALUE="$(cat "$BACKUP_PASSPHRASE_FILE")"
else
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE is required; generate one with openssl rand -base64 32}"
  PASS_ARG="env:BACKUP_PASSPHRASE"
  PASS_VALUE="$BACKUP_PASSPHRASE"
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-900}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
# libpq prefers PGPASSWORD over a passfile; drop it when a passfile is provided.
if [ -n "${PGPASSFILE:-}" ]; then unset PGPASSWORD; fi

mkdir -p "$BACKUP_DIR"

# Remove encrypted partials and any legacy plaintext left by a killed run.
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'workshop-pos-*.dump' -o -name 'workshop-pos-*.verify.dump' -o -name '.*.dump.enc.partial' \) \
  -delete

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  base="workshop-pos-$timestamp"
  fifo="/tmp/.$base.plain.fifo"
  sumfile="/tmp/.$base.plain.sha256"
  partial="$BACKUP_DIR/.$base.dump.enc.partial"
  encrypted="$BACKUP_DIR/$base.dump.enc"

  rm -f "$fifo" "$sumfile"
  mkfifo "$fifo"
  trap 'rm -f "$fifo" "$sumfile" "$partial"' EXIT HUP INT TERM

  printf 'backup start: %s\n' "$timestamp"

  # Hash the plaintext stream while encrypting it; nothing unencrypted touches disk.
  ( sha256sum < "$fifo" > "$sumfile" ) &
  hash_pid=$!

  if ! pg_dump --format=custom --compress=9 --no-owner --no-privileges \
      --lock-wait-timeout=30s \
      | tee "$fifo" \
      | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
          -out "$partial" -pass "$PASS_ARG"; then
    kill "$hash_pid" 2>/dev/null || true
    wait "$hash_pid" 2>/dev/null || true
    printf 'backup failed: pg_dump/encrypt pipeline\n' >&2
    return 1
  fi

  wait "$hash_pid" || { printf 'backup failed: checksum worker\n' >&2; return 1; }
  checksum="$(awk '{ print $1 }' "$sumfile")"
  [ -n "$checksum" ] || { printf 'backup failed: empty checksum\n' >&2; return 1; }
  [ -s "$partial" ] || { printf 'backup failed: empty ciphertext\n' >&2; return 1; }

  decrypted_checksum="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$partial" -pass "$PASS_ARG" | sha256sum | awk '{ print $1 }')" ||
    { printf 'backup failed: decrypt verification\n' >&2; return 1; }
  [ "$decrypted_checksum" = "$checksum" ] ||
    { printf 'backup failed: checksum mismatch\n' >&2; return 1; }

  mac="$(openssl dgst -sha256 -hmac "$PASS_VALUE" "$partial" | awk '{ print $NF }')" ||
    { printf 'backup failed: ciphertext MAC\n' >&2; return 1; }
  [ -n "$mac" ] || { printf 'backup failed: empty ciphertext MAC\n' >&2; return 1; }

  mv "$partial" "$encrypted"
  [ -s "$encrypted" ] || { printf 'backup failed: missing ciphertext\n' >&2; return 1; }
  printf '%s  %s\n' "$checksum" "$(basename "$encrypted")" > "$encrypted.sha256"
  printf '%s  %s\n' "$mac" "$(basename "$encrypted")" > "$encrypted.hmac"
  chmod 600 "$encrypted" "$encrypted.sha256" "$encrypted.hmac" 2>/dev/null || true

  printf 'backup ok: %s (%s bytes, sha256 %s)\n' \
    "$(basename "$encrypted")" "$(wc -c < "$encrypted")" "$checksum"

  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'workshop-pos-*.dump.enc' \
    -mtime +"$RETENTION_DAYS" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'workshop-pos-*.dump.enc.sha256' \
    -mtime +"$RETENTION_DAYS" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'workshop-pos-*.dump.enc.hmac' \
    -mtime +"$RETENTION_DAYS" -print -delete

  trap - EXIT HUP INT TERM
}

if [ "${1:-loop}" = "backup-once" ]; then
  run_backup
  exit 0
fi

while true; do
  run_backup
  sleep "$INTERVAL_SECONDS"
done
SCRIPT

RUN chmod 0755 /usr/local/bin/backup-entrypoint

USER postgres

ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
