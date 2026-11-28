# Backup and Restore Runbook

| Field | Value |
| --- | --- |
| Product | Workshop POS |
| Audience | Buyer's operations team; seller's release engineer during handover |
| Status | Executed on 2026-11-28 on the WP9 candidate; see §8 for the drill record |
| Targets | **RPO ≤ 15 minutes; RTO ≤ 2 hours** (PRD NFR-009) |
| Related | `compose.yaml` (`backup` profile), `docker/backup.Dockerfile`, `docs/ops/handover-checklist.md` §F, `docs/ops/handover-evidence.md` |

This runbook is written for the buyer's team, with no dependency on the seller's machine or accounts. Commands assume the repository is checked out at the delivery commit and `.env` is present on the host.

---

## 1. What is shipped

The optional `backup` Compose service (profile `backup`) runs a loop inside a small image:

- `pg_dump --format=custom --compress=9 --no-owner --no-privileges`.
- AES-256-CBC encryption with PBKDF2 (200,000 iterations) and a per-file salt, plus an **HMAC-SHA256 over the ciphertext** stored in `<dump>.enc.hmac` (encrypt-then-MAC). The MAC detects ciphertext tampering; it does **not** prevent replacing a file with an older valid dump, so keep an off-host manifest/signature if rollback protection matters.
- A SHA-256 of the plaintext dump computed during the streaming encrypt, then verified by decrypting the ciphertext and comparing before the encrypted file is published. **No plaintext dump is written to disk**; the dump stream goes through a FIFO into both the hasher and OpenSSL.
- A `<dump>.sha256` sidecar file next to each encrypted dump.
- Pruning of encrypted dumps and checksums older than `BACKUP_RETENTION_DAYS`.
- On any failure the container exits non-zero and the restart policy retries; a failed backup is never reported as success.

No passphrase, password, or key is baked into the image. The container runs as the `postgres` user, with a read-only root filesystem, `no-new-privileges`, and all Linux capabilities dropped. Only the `/backups` volume and `/tmp` are writable.

The service is **disabled by default**. A normal `docker compose up -d` starts only `db`, `web`, and `proxy`.

---

## 2. RPO and RTO targets

| Target | Value | How the shipped design meets it |
| --- | --- | --- |
| RPO | ≤ 15 minutes (database); host-loss RPO = the buyer's off-host copy interval | `BACKUP_INTERVAL_SECONDS=900` takes a dump every 15 minutes, with the first dump immediately at container start. A database crash can lose up to one interval. A **host loss** loses everything not copied off the host, so the host-loss RPO is set by the off-host copy cadence in §5, not by this interval. |
| RTO | ≤ 2 hours | Restore is a single `pg_restore` into a new database plus the normal application start. The 2026-11-28 rehearsal completed in seconds on a small dataset; production time grows with database size and must be re-measured quarterly. |

`pg_dump` is a logical backup, not WAL archiving. If the buyer needs point-in-time recovery inside the interval, add `pgBackRest` or PostgreSQL WAL archiving as a separate, licensed (MIT) operational step. That is a buyer decision and is not configured here.

Retention is **30 days by default** (`BACKUP_RETENTION_DAYS=30`). Sales records may need to be kept for ten years under the buyer's records policy; backups are not the records system. Choose a retention period with the buyer's counsel and keep the database as the authoritative long-term store.

---

## 3. Passphrase generation and storage

Generate the passphrase once, outside the repository:

```sh
openssl rand -base64 48
```

Store it in the buyer's secret manager (for example, a password manager or a secrets vault). Put it in the host `.env` only as a reference to a secret-managed value, or inject it at deploy time:

```sh
BACKUP_PASSPHRASE='<value from the secret manager>'
```

Rules:

- Never commit the passphrase, paste it into chat, or leave it in shell history.
- Keep at least two escrowed copies with named custodians. **Without the passphrase, every encrypted dump is unrecoverable.** There is no recovery path and no back door.
- The database password and the passphrase are different secrets. Rotate them independently.
- To rotate the passphrase, decrypt every retained dump with the old value and re-encrypt with the new value before destroying the old passphrase; or keep the old passphrase until the retention window expires. Record the rotation date and custodian.

**Preferred: a mounted secret file.** Put the passphrase in a host file readable only by the deploy owner (mode `0400`), mount it into the container, and set `BACKUP_PASSPHRASE_FILE` to that path. A Compose override can do this without changing the shipped defaults:

```yaml
services:
  backup:
    secrets:
      - backup_passphrase
secrets:
  backup_passphrase:
    file: /etc/workshop-pos/backup_passphrase
```

Then set `BACKUP_PASSPHRASE_FILE=/run/secrets/backup_passphrase` in `.env`. The entrypoint uses `openssl -pass file:…` and never puts the passphrase in the process environment. The same pattern applies to `PGPASSFILE` for the database password.

The environment-variable form (`BACKUP_PASSPHRASE`) remains supported for simple single-host setups, but anyone in the `docker` group can read container environment values with `docker inspect`; prefer the secret file on a shared host.

The sidecar fails closed when neither a readable `BACKUP_PASSPHRASE_FILE` nor a non-empty `BACKUP_PASSPHRASE` is present; it exits with a clear message instead of writing an unencrypted or unreadable file.

---

## 4. Enable the sidecar

On the production host, with `.env` containing `POSTGRES_*`, `BETTER_AUTH_SECRET`, and the backup variables from `.env.example`:

```sh
docker compose --profile backup up -d --build backup
docker compose logs -f --tail=50 backup
```

Expected first log lines:

```
backup start: <UTC timestamp>
backup ok: workshop-pos-<UTC timestamp>.dump.enc (<bytes> bytes, sha256 <hex>)
```

The container repeats every `BACKUP_INTERVAL_SECONDS`. Its Compose healthcheck goes **unhealthy** when the newest `workshop-pos-*.dump.enc` is older than two intervals, so a stalled loop or a host that stopped writing is visible in `docker compose ps`. Use that health status (or a file-age probe) as the alert source. Verify the volume:

```sh
docker compose exec backup ls -l /backups
docker compose exec backup cat /backups/workshop-pos-<timestamp>.dump.enc.sha256
```

The `.sha256` sidecar contains the **plaintext** dump checksum and the encrypted file name; it does not reveal the data. The `.hmac` sidecar contains the ciphertext MAC. Store both beside the ciphertext and verify the HMAC before decrypting.

### Operational checks

- Alert when a backup file is older than two intervals.
- Alert when the `backup` container is restarting.
- Monitor free space on the Docker volume and the off-host destination.
- Confirm the host clock is synchronized; file names are UTC timestamps.

---

## 5. Off-host copy (buyer-owned)

The named volume lives on the same host as the database. A host loss loses both, so the **host-loss RPO is the off-host copy cadence you choose here** (for example every 15 minutes for parity with the dump interval, or hourly if the buyer accepts a longer host-loss window). Copy encrypted dumps off-host on that schedule, for example:

```sh
docker run --rm \
  -v workshop-pos_workshop_pos_backups:/backups:ro \
  -v /secure/offsite/workshop-pos:/out \
  alpine sh -c 'cp -a /backups/. /out/'
```

Then replicate `/secure/offsite/workshop-pos` to the buyer's off-site storage with its own access control and encryption at rest. The files are already encrypted; do not add a second undocumented passphrase layer unless the buyer's policy requires it, and document the recovery chain.

Keep at least three copies (host volume, off-host, offline/immutable), on two media types, with one off-site — or the buyer's equivalent policy. Test a restore from the **off-host** copy, not only from the volume.

---

## 6. Restore procedure

Restore into a **new scratch database** first. Never restore over the only production database.

### 6.1 Load the stack environment and decrypt

Run this from the repository root on the host. Sourcing `.env` is required; otherwise `POSTGRES_USER`/`POSTGRES_DB` expand empty and every `createdb`/`pg_restore` below fails.

```sh
set -a; . ./.env; set +a
: "${POSTGRES_USER:?POSTGRES_USER missing from .env}"
: "${POSTGRES_DB:?POSTGRES_DB missing from .env}"
umask 077

# Use a host-side escrow file, not the container path in .env.
PASS_FILE="${BACKUP_PASSPHRASE_HOST_FILE:-/etc/workshop-pos/backup_passphrase}"
if [ -s "$PASS_FILE" ]; then
  PASS_ARG="file:$PASS_FILE"
  PASS_VALUE="$(cat "$PASS_FILE")"
else
  # No echo; the value stays out of shell history and the process list.
  read -rsp 'Backup passphrase: ' BACKUP_PASSPHRASE; echo
  export BACKUP_PASSPHRASE
  PASS_ARG="env:BACKUP_PASSPHRASE"
  PASS_VALUE="$BACKUP_PASSPHRASE"
fi

# Verify the ciphertext MAC before decrypting.
ENC=workshop-pos-<timestamp>.dump.enc
EXPECTED_MAC="$(awk '{ print $1 }' "$ENC.hmac")"
ACTUAL_MAC="$(openssl dgst -sha256 -hmac "$PASS_VALUE" "$ENC" | awk '{ print $NF }')"
[ "$EXPECTED_MAC" = "$ACTUAL_MAC" ] || { echo "HMAC mismatch: stop"; exit 1; }

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$ENC" \
  -out workshop-pos-<timestamp>.dump \
  -pass "$PASS_ARG"
shasum -a 256 workshop-pos-<timestamp>.dump
```

`umask 077` keeps the decrypted dump readable only by the operator. Compare the hash with the first field of `workshop-pos-<timestamp>.dump.enc.sha256`. A mismatch means the file or passphrase is wrong; stop. Remove the decrypted file (`rm -f workshop-pos-<timestamp>.dump`) as soon as the restore has been verified.

### 6.2 Restore into a scratch database

```sh
docker compose exec -T db createdb -U "$POSTGRES_USER" workshop_pos_restore
docker compose exec -T db pg_restore -U "$POSTGRES_USER" \
  -d workshop_pos_restore --no-owner --no-privileges < workshop-pos-<timestamp>.dump
```

`pg_restore` may print notices for extensions or ownership; they are not failures unless the exit code is non-zero. Check the exit code.

### 6.3 Compare row counts

```sh
for db in "$POSTGRES_DB" workshop_pos_restore; do
  echo "== $db"
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$db" -tAc \
    "select 'orders='||count(*) from orders
     union all select 'order_lines='||count(*) from order_lines
     union all select 'payments='||count(*) from payments
     union all select 'stock_ledger='||count(*) from stock_ledger
     union all select 'audit_log='||count(*) from audit_log
     union all select 'customers='||count(*) from customers
     union all select 'vehicles='||count(*) from vehicles
     union all select 'user='||count(*) from \"user\";"
done
```

Counts must match the source at the dump timestamp. Writes after the dump will make the source larger; explain any difference before proceeding.

### 6.4 Smoke test against the restored database

Start the production image (or a temporary web container) with `DATABASE_URL` pointing at the scratch database, then:

```sh
curl -fsS http://<host>:<port>/api/v1/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://<host>:<port>/login
```

Expected: health returns `{"status":"ok","database":"up","migration":"<version>","timestamp":"..."}` and `/login` returns `200`. Sign in as an Owner if the restored credentials are known, open the catalog, and confirm one recent order and its receipt.

### 6.5 Cutover (production)

Only after 6.1–6.4 pass and the buyer approves. The app role owns the restored objects because `pg_restore --no-owner` assigns them to the restoring role (`$POSTGRES_USER`). If the restore role differs from the app role, add `REASSIGN OWNED BY <old> TO <app>` plus the matching grants before starting `web`.

```sh
set -a; . ./.env; set +a

# 1. Final backup immediately before the cutover (rollback artifact).
docker compose --profile backup run --rm backup backup-once

# 2. Stop writes.
docker compose stop web

# 3. Close remaining sessions, then rename the current database.
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$POSTGRES_DB' and pid <> pg_backend_pid();"
PRE="${POSTGRES_DB}_pre_cutover_$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c \
  "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"$PRE\";"

# 4. Restore the chosen dump into the original name.
docker compose exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges < workshop-pos-<timestamp>.dump

# 5. Start and verify.
docker compose up -d web
curl -fsS http://<host>:<port>/api/v1/health
```

Then compare the counts from §6.3 against the new production database and run one read-only report. Keep `$PRE` and the pre-cutover backup until the buyer signs off.

**Rollback:**

```sh
set -a; . ./.env; set +a
docker compose stop web
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$POSTGRES_DB' and pid <> pg_backend_pid();"
docker compose exec -T db dropdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c \
  "ALTER DATABASE \"$PRE\" RENAME TO \"$POSTGRES_DB\";"
docker compose up -d web
curl -fsS http://<host>:<port>/api/v1/health
```

Replace `$PRE` with the recorded pre-cutover name. Do not delete `$PRE` or the pre-cutover backup until sign-off.

### 6.6 Remove the scratch database

```sh
docker compose exec -T db dropdb -U "$POSTGRES_USER" workshop_pos_restore
```

Remove the decrypted dump from the host after the restore. The encrypted copy remains until retention expires.

---

## 7. Failure handling

| Symptom | Cause | Action |
| --- | --- | --- |
| `BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE is required` and exit | Profile enabled without a passphrase | Set the secret or mount the file; restart the service |
| `backup failed: pg_dump/encrypt pipeline` | Dump failed, the DB lock wait exceeded 30 s, encryption failed, or the stream broke | Read the log, fix credentials/locks/disk; the container exits so the restart policy retries. Do not delete the last good dump |
| `backup failed: checksum mismatch` | Truncated ciphertext or a crypto fault | Keep the previous good dump; investigate disk/memory before retrying |
| `backup failed: empty checksum/ciphertext` | `pg_dump` produced nothing or encryption wrote nothing | Check the database state and free space |
| `bad decrypt` / MAC failure during restore | Wrong passphrase, tampered, or corrupted ciphertext | Try the escrowed passphrase; if it still fails, use another retained copy. Do not bypass the MAC |
| `checksum mismatch` after decrypt | Wrong passphrase or corrupted copy | Try the escrowed passphrase; if it still fails, use another retained copy |
| `pg_restore: error: ... already exists` | Restoring into a non-empty database | Use a fresh database or `--clean --if-exists` after confirming the target |
| Health `database:"down"` after restore | Wrong `DATABASE_URL` or missing grants | Check the URL and `pg_restore` exit code |
| Disk full | Retention too long or off-host copy failing | Extend the volume, fix the copy job, reduce retention |

Do not edit an encrypted dump. Do not "repair" a failed restore by copying individual tables from production; restore the whole dump into a scratch database and compare.

---

## 8. Rehearsal record — 2026-11-28

Environment: macOS arm64 workstation, Docker Engine 29.4.0, `postgres:19-alpine` and the shipped `docker/backup.Dockerfile` image, development database on loopback. **This is a single-host rehearsal, not a production-scale test.**

| Step | Command (abridged) | Observed result |
| --- | --- | --- |
| Build image | `docker build -f docker/backup.Dockerfile -t workshop-pos-backup:wp9-drill-v6 .` | Built in a few seconds; `openssl 3.5.9-r1` + bash installed; image runs as `postgres` |
| Take backup | `docker run ... workshop-pos-backup:wp9-drill-v6 backup-once` | `workshop-pos-20261128T035332Z.dump.enc`, 110,928 bytes; **13 s** on this heavily loaded host (earlier runs: 2 s); plaintext sha256 `337e31b8…cd843f`; streaming round-trip check passed |
| No plaintext at rest | Inspect `/backups` after the run | Only mode-600 `.dump.enc`, `.dump.enc.sha256`, and `.dump.enc.hmac`; `plaintext_count=0` |
| Crash cleanup | Seed a fake `*.dump`, `.*.partial`, `*.verify.dump`, then run | All three were removed at startup; the new encrypted dump remained |
| Fail-closed check | Same image with `BACKUP_PASSPHRASE=` | Exit 2 with `BACKUP_PASSPHRASE or BACKUP_PASSPHRASE_FILE is required`; no file written |
| Fail-loud check | Loop mode against an unreachable database | Exit 1 after `backup failed: pg_dump/encrypt pipeline`; **0** "backup ok" lines (the earlier `if ! run_backup` bug is fixed) |
| Ciphertext MAC | `openssl dgst -sha256 -hmac …` over the encrypted file | Expected and actual matched (`3ab5cd9c…`); flipping one ciphertext byte changed the MAC (`aeccabd5…`), so tamper detection works |
| Healthcheck | Container `find … -mmin -<2×interval>` | Exit 0 with a fresh encrypted dump; Compose renders the probe with `start_period: 180s` |
| Decrypt | `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 ...` under `umask 077` | **< 1 s**; checksum matched the sidecar exactly |
| Restore | `createdb workshop_pos_restore` + `pg_restore --no-owner --no-privileges` | **2 s**; exit 0 |
| Row counts | Source vs restore | orders 11/11, order_lines 20/20, payments 10/10, products 1/1, `user` 5/5, audit_log 19/19, stock_ledger 9/9, customers 1/1, vehicles 1/1 |
| App smoke | `next dev` against `workshop_pos_restore`, then `/api/v1/health` and `/login` | health `200` `{"status":"ok","database":"up","migration":"1795678684300","timestamp":"2026-11-28T03:54:09.997Z"}`; login `200` |
| RTO | Restore start → health 200 | **6 s** on this dataset; target ≤ 2 h |
| Cleanup | `dropdb workshop_pos_restore`, remove drill volume | Done; no decrypted dump or passphrase stored in the repository |

Limits recorded, not hidden:

- Dataset was small (11 orders). Production RTO must be re-measured with production-sized data; the 13 s dump and 6 s RTO are **not** production-scale measurements.
- The drill ran on one host; host-loss recovery from the off-host copy was **not** exercised.
- WAL/point-in-time recovery is not configured; the database-loss RPO is the 15-minute dump interval, not transaction-level. The host-loss RPO is the off-host copy cadence.
- Alerting for stale backups is available through the Compose healthcheck but was not wired to an external monitoring system in this delivery.
- The restore used the same `$POSTGRES_USER` as the app; a different restore role would need `REASSIGN OWNED`/grants (documented in §6.5).

---

## 9. What the buyer owns after handover

- The host, Docker Engine, volume, disk capacity, and clock.
- The passphrase, its escrow, rotation, and custodian list.
- The off-host destination, its access control, and its retention/immutability policy.
- Monitoring and alerting for backup age and container restarts.
- Quarterly restore rehearsals on a scratch database, with the measured RTO recorded.
- The legal retention period for sales records and personal data, with counsel.
- Any WAL archiving or managed backup service added later, including its licence and cost.
