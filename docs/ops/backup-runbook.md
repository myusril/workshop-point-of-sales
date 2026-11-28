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
- AES-256-CBC encryption with PBKDF2 (200,000 iterations) and a per-file salt.
- A checksum of the plaintext dump, verified immediately by decrypting the ciphertext and comparing before the plaintext is deleted.
- A `<dump>.sha256` sidecar file next to each encrypted dump.
- Pruning of encrypted dumps and checksums older than `BACKUP_RETENTION_DAYS`.
- On any failure the container exits non-zero and the restart policy retries; a failed backup is never reported as success.

No passphrase, password, or key is baked into the image. The container runs as the `postgres` user, with a read-only root filesystem, `no-new-privileges`, and all Linux capabilities dropped. Only the `/backups` volume and `/tmp` are writable.

The service is **disabled by default**. A normal `docker compose up -d` starts only `db`, `web`, and `proxy`.

---

## 2. RPO and RTO targets

| Target | Value | How the shipped design meets it |
| --- | --- | --- |
| RPO | ≤ 15 minutes | `BACKUP_INTERVAL_SECONDS=900` takes a dump every 15 minutes, with the first dump immediately at container start. A host or database crash can lose up to one interval. |
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

The sidecar fails closed when `BACKUP_PASSPHRASE` is empty; the container exits with a clear message instead of writing an unencrypted or unreadable file.

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

The container repeats every `BACKUP_INTERVAL_SECONDS`. Verify the volume:

```sh
docker compose exec backup ls -l /backups
docker compose exec backup cat /backups/workshop-pos-<timestamp>.dump.enc.sha256
```

The checksum sidecar contains the **plaintext** dump checksum and the encrypted file name. It is safe to store beside the ciphertext; it does not reveal the data.

### Operational checks

- Alert when a backup file is older than two intervals.
- Alert when the `backup` container is restarting.
- Monitor free space on the Docker volume and the off-host destination.
- Confirm the host clock is synchronized; file names are UTC timestamps.

---

## 5. Off-host copy (buyer-owned)

The named volume lives on the same host as the database. A host loss loses both. Copy encrypted dumps off-host on a schedule the buyer controls, for example:

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

### 6.1 Decrypt

On a host with OpenSSL 3:

```sh
export BACKUP_PASSPHRASE='<from the secret manager>'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in workshop-pos-<timestamp>.dump.enc \
  -out workshop-pos-<timestamp>.dump \
  -pass env:BACKUP_PASSPHRASE
shasum -a 256 workshop-pos-<timestamp>.dump
```

Compare the result with the first field of `workshop-pos-<timestamp>.dump.enc.sha256`. A mismatch means the file or passphrase is wrong; stop.

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
     union all select 'vehicles='||count(*) from vehicles;"
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

Only after 6.1–6.4 pass and the buyer approves:

1. Stop writes: put the app in maintenance or stop `web`.
2. Take one final backup of the current production database.
3. Rename or drop the old database, restore the chosen dump into the production database name, and verify the counts.
4. Start `web`, check `/api/v1/health`, and run one read-only report.
5. Keep the old database and its backup until the buyer signs off.

Rollback: stop `web`, restore the pre-cutover backup into the production database name, start `web`, and verify health. The pre-cutover backup is the rollback artifact; do not delete it until sign-off.

### 6.6 Remove the scratch database

```sh
docker compose exec -T db dropdb -U "$POSTGRES_USER" workshop_pos_restore
```

Remove the decrypted dump from the host after the restore. The encrypted copy remains until retention expires.

---

## 7. Failure handling

| Symptom | Cause | Action |
| --- | --- | --- |
| `BACKUP_PASSPHRASE is required` and exit | Profile enabled without a passphrase | Set the secret; restart the service |
| `backup failed; exiting` | `pg_dump`, encryption, or checksum failed | Read the log, fix credentials/disk, let the restart policy retry; do not delete the last good dump |
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
| Build image | `docker build -f docker/backup.Dockerfile -t workshop-pos-backup:wp9-drill .` | Built in 7.58 s; `openssl 3.5.9-r1` installed; image runs as `postgres` |
| Take backup | `docker run ... workshop-pos-backup:wp9-drill backup-once` | `workshop-pos-20261128T024230Z.dump.enc`, 125,632 bytes; **1 s**; plaintext sha256 `16dd8e0d…93dfb9`; round-trip check inside the container passed |
| Fail-closed check | Same image with `BACKUP_PASSPHRASE=` | Exit 2 with `BACKUP_PASSPHRASE is required`; no file written |
| Decrypt | `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 ...` | **< 1 s**; checksum matched the sidecar exactly |
| Restore | `createdb workshop_pos_restore` + `pg_restore --no-owner --no-privileges` | **< 1 s**; exit 0 |
| Row counts | Source vs restore | orders 14/14, order_lines 27/27, payments 11/11, stock_ledger 15/15, audit_log 70/70, customers 6/6, vehicles 4/4, users 10/10 |
| App smoke | `next dev` against `workshop_pos_restore`, then `/api/v1/health` and `/login` | health `200` `{"status":"ok","database":"up","migration":"1795678684300"}`; login `200` |
| RTO | Restore start → health 200 | **4 s** on this dataset; target ≤ 2 h |
| Cleanup | `dropdb workshop_pos_restore`, remove drill volume | Done; no decrypted dump or passphrase stored in the repository |

Limits recorded, not hidden:

- Dataset was small (14 orders). Production RTO must be re-measured with production-sized data.
- The drill ran on one host; host-loss recovery from the off-host copy was **not** exercised.
- WAL/point-in-time recovery is not configured; the RPO is the 15-minute dump interval, not transaction-level.
- Alerting for stale backups is documented but was not wired to a monitoring system in this delivery.

---

## 9. What the buyer owns after handover

- The host, Docker Engine, volume, disk capacity, and clock.
- The passphrase, its escrow, rotation, and custodian list.
- The off-host destination, its access control, and its retention/immutability policy.
- Monitoring and alerting for backup age and container restarts.
- Quarterly restore rehearsals on a scratch database, with the measured RTO recorded.
- The legal retention period for sales records and personal data, with counsel.
- Any WAL archiving or managed backup service added later, including its licence and cost.
