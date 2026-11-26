# Seller Handover Checklist

| Field | Value |
| --- | --- |
| Document | Pre-delivery verification and evidence checklist |
| Version | 0.1-draft |
| Date | 2026-11-26 |
| Status | **Draft — not executed.** No item below has been run or verified while writing this document. |
| Audience | Seller engineering lead; buyer's technical representative |
| Scope | The delivered source repository, its build and deployment path, its third-party dependencies and assets, and the accounts needed to operate it |
| Related documents | `docs/ops/decision-policy.md`, `docs/ops/license-inventory.md`, `README.md` |

**How to read this document**

- Every checkbox starts unchecked. A checked box means the command was run on the exact commit being handed over, the output was captured, and a second person reviewed the evidence.
- `Result` values are `pass`, `fail`, `blocked`, or `n/a` with a written reason. "Probably fine" is not a result.
- This checklist records verification. It is not a substitute for the buyer's own acceptance testing.
- Do not mark an item complete because the code "looks right". Run the command or record `blocked`.

**Handover is blocked when any of these is true**

- A secret scan finding is unrotated.
- A production dependency uses a license not approved in `docs/ops/license-inventory.md`.
- The fresh-clone install, database migration, or quality gate fails.
- The backup restore drill fails.
- Domain, credential, or account ownership is incomplete.
- The final commit or archive hash in the signed manifest does not match what the buyer received.

---

## 0. Preparation and evidence rules

Create one evidence directory **outside the repository** and never commit it. It will contain logs, command output, hashes, and screenshots.

```sh
export EVIDENCE_DIR="/tmp/handover-evidence-<DATE>"
mkdir -p "$EVIDENCE_DIR"
test -n "$(ls -A "$EVIDENCE_DIR")" && { echo "evidence directory must be empty"; exit 1; }
```

Set the values used throughout. Replace every `<...>` placeholder before running anything.

```sh
export REPO_URL='<REPO_URL>'
export COMMIT='<COMMIT_SHA>'
export VERIFY_DIR=/tmp/handover-verify
export DB_NAME='<DB_NAME>'
export DB_USER='<DB_USER>'
export DOMAIN='<DOMAIN>'
```

Evidence conventions:

- File name: `<section>-<item>-<YYYYMMDD>.log`, for example `A1-gitleaks-20261126.log`.
- Each log starts with the command, the working directory, `git rev-parse HEAD`, the Node and Docker versions, and the operator initials.
- Capture exit codes explicitly (bash): `command 2>&1 | tee "$EVIDENCE_DIR/file.log"; echo "exit=${PIPESTATUS[0]}"`.
- Redact secret values before saving output. Record key identifiers and provider names, never the secret itself.
- Store personal data, contracts, and invoices outside the repository in an access-controlled location; record only the path and SHA-256 in the evidence log.
- Evidence is retained for the period agreed in the sale contract.

Global preconditions:

- [ ] **0.1** Use a machine that has never held the seller's development accounts, or at minimum a clean OS user with no seller credentials in environment variables, SSH agent, Git credential helper, or package manager config.
- [ ] **0.2** Confirm the buyer's intended Node.js, Docker, and PostgreSQL versions from the repository's pins, not from the seller's machine.
- [ ] **0.3** Confirm the delivery candidate is a commit, not a working directory. Untracked or ignored local files are not part of the delivery.
- [ ] **0.4** Record the candidate commit:

```sh
git status --porcelain
git rev-parse HEAD | tee "$EVIDENCE_DIR/0.4-candidate-commit.log"
git log -1 --format='%H%n%cI%n%s' | tee -a "$EVIDENCE_DIR/0.4-candidate-commit.log"
```

Expected: `git status --porcelain` prints nothing. Any output means the candidate is not a commit; stop and commit or discard the changes deliberately.

---

## A. Secrets, credentials, and repository hygiene

### A1. Full-history secret scan

- [ ] Run the required scan over the complete Git history, not only the working tree.

```sh
gitleaks version | tee "$EVIDENCE_DIR/A1-gitleaks-version.log"
gitleaks git --redact -v . 2>&1 | tee "$EVIDENCE_DIR/A1-gitleaks-history.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Also scan the working tree, including files that are ignored but still present on the seller's machine, in case the delivery process copies them.

```sh
gitleaks dir --redact -v . 2>&1 | tee "$EVIDENCE_DIR/A1-gitleaks-worktree.log"
echo "exit=${PIPESTATUS[0]}"
```

Notes:

- `gitleaks git` exits non-zero when it finds a leak. A non-zero exit is a finding, not a tooling error.
- If the installed gitleaks version does not support `gitleaks dir`, use its documented working-tree command and record the version and command used.
- Do not "fix" a finding by editing the report. Fix the source: rotate the credential, remove the file from the delivery commit, and record the rotation in A3.
- Removing a secret from the current tree does not remove it from history. Decide with the buyer whether history must be rewritten. History rewriting is destructive, changes every commit hash, and requires written approval; never do it as a silent cleanup.
- Record every finding, its location, and its disposition in the evidence log.

Evidence: `A1-gitleaks-history.log`, `A1-gitleaks-worktree.log`, finding disposition table.

### A2. Secret-shaped files are not tracked

- [ ] List tracked environment, key, and certificate files. Only secret-free templates may appear.

```sh
git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$' \
  | tee "$EVIDENCE_DIR/A2-tracked-env.log" || true
git ls-files | grep -Ei '\.(pem|key|p12|pfx|keystore|jks|p8|mobileprovision)$' \
  | tee -a "$EVIDENCE_DIR/A2-tracked-env.log" || true
```

Expected: both lists are empty. `.env.example` and `.env.*.example` are allowed, but they must contain placeholders only.

- [ ] Read every allowed example file and confirm no value looks reusable: no real hostnames, account IDs, phone numbers, API key prefixes, or database passwords.

```sh
git ls-files '*.example' | tee "$EVIDENCE_DIR/A2-example-files.log"
```

### A3. Secret rotation

Rotate every credential that existed during development, **even if A1 found nothing**, because a clean scan does not prove a credential was never copied into a chat, screenshot, ticket, or local file outside Git.

- [ ] Build the inventory below and rotate each row. Add rows as needed.

| Credential | Where it is used | Rotated on | Old value revoked | Verified old value fails | Evidence |
| --- | --- | --- | --- | --- | --- |
| Database password (development) | Local Compose / dev server |  |  |  |  |
| Database password (staging) | Staging deployment |  |  |  |  |
| Database password (production, if any) | Production |  |  |  |  |
| Session/JWT signing secret | API authentication |  |  |  |  |
| Data encryption key | Application-level encryption |  |  |  |  |
| Payment gateway sandbox key | Checkout testing |  |  |  |  |
| Payment gateway production key | Live payments |  |  |  |  |
| Payment webhook signing secret | Callback verification |  |  |  |  |
| QRIS / acquiring provider credentials | Live payments |  |  |  |  |
| Email / SMTP password or API key | Notifications |  |  |  |  |
| WhatsApp Business API token | Notifications |  |  |  |  |
| Object storage access key | Uploads and backups |  |  |  |  |
| CI/CD tokens | Build and deploy |  |  |  |  |
| Container registry token | Image publishing |  |  |  |  |
| SSH deploy key | Server access |  |  |  |  |
| Domain registrar / DNS API token | DNS changes |  |  |  |  |
| Error-tracking DSN or ingest key | Monitoring |  |  |  |  |
| Analytics API secret | Reporting |  |  |  |  |
| App store / Play Console key | Mobile release |  |  |  |  |
| Any credential that ever appeared in chat, a screenshot, or a log | Unknown until reviewed |  |  |  |  |

- [ ] For each rotated credential, prove the old value no longer works. Use the provider's dedicated test endpoint or a harmless read call and record the status code.

```sh
# Replace with the provider's low-risk identity or ping endpoint.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $OLD_SECRET" \
  '<PROVIDER_TEST_ENDPOINT>' | tee "$EVIDENCE_DIR/A3-old-secret-<NAME>.log"
```

Expected: `401` or `403`. A `200` means the old credential is still valid; revoke it and repeat.

- [ ] Record where the **new** values live (the buyer's secret manager path or key name), never the values themselves. No secret may be sent by chat or plain email.

### A4. Environment-file discipline

- [ ] Confirm local env files are ignored and only the template is tracked.

```sh
git check-ignore -v .env .env.local .env.test .env.production .brief/ 2>&1 \
  | tee "$EVIDENCE_DIR/A4-ignore.log" || true
git ls-files '.env*' | tee -a "$EVIDENCE_DIR/A4-ignore.log"
```

Expected: `.env`, `.env.local`, `.env.test`, `.env.production`, and `.brief/` are matched by ignore rules; `git ls-files '.env*'` prints only `.env.example` (and any `.env.*.example` templates).

- [ ] Confirm every variable named in `.env.example` is documented with a safe placeholder and a comment, and that no variable is missing from the example but required by the code. Compare with the configuration loader and `docker compose config`.

```sh
docker compose config > "$EVIDENCE_DIR/A4-compose-config.yaml"
```

Review the rendered file for embedded real values, absolute host paths, and internal hostnames.

### A5. Local paths and internal names

- [ ] Scan the tracked tree for absolute user paths, developer machine names, internal domains, and private registry addresses.

```sh
git grep -nIE '(/Users/|/home/[^/ ]+/|C:\\\\Users\\\\|file:///)' -- . \
  ':!package-lock.json' 2>&1 | tee "$EVIDENCE_DIR/A5-paths.log" || true
git grep -nIE '(localhost:[0-9]{2,5}|127\.0\.0\.1|0\.0\.0\.0)' -- . \
  2>&1 | tee -a "$EVIDENCE_DIR/A5-paths.log" || true
git grep -nIE '[A-Za-z0-9._-]+\.(internal|local|lan|corp)\b' -- . \
  2>&1 | tee -a "$EVIDENCE_DIR/A5-paths.log" || true
```

- [ ] Scan for the seller's private names. Take the actual list from the private handover sheet; do **not** write the real names into this repository.

```sh
git grep -nIiE '(<SELLER_ORG_NAME>|<SELLER_PERSONAL_DOMAIN>|<INTERNAL_PRODUCT_NAME>|<INTERNAL_REPO_NAME>)' -- . \
  2>&1 | tee "$EVIDENCE_DIR/A5-internal-names.log" || true
```

- [ ] Review every hit. Legitimate `localhost` defaults in example configs may stay if they are documented and overridden in deployment. Remove or replace anything that identifies the seller, a seller machine, or a private service.
- [ ] Check deleted files as well, because a path remains in history after deletion. List them and review any configuration, script, or documentation file.

```sh
git log --all --diff-filter=D --name-only --pretty=format: \
  | sort -u | tee "$EVIDENCE_DIR/A5-deleted-files.log"
```

- [ ] Check for private package registries or vendored credentials in package manager configuration.

```sh
cat .npmrc 2>/dev/null || echo "no repository .npmrc"
grep -o '"resolved": "[^"]*"' package-lock.json \
  | grep -v 'https://registry.npmjs.org/' \
  | head -50 | tee "$EVIDENCE_DIR/A5-registry.log"
```

Expected: no repository `.npmrc` pointing at a private registry, and no `resolved` URLs outside the public npm registry.

### A6. AI tooling inventory

- [ ] List tracked files that exist only for AI-assisted development.

```sh
git ls-files \
  | grep -E '(^|/)(AGENTS\.md|\.omp/|\.brief/|orca\.yaml|\.worktreeinclude)$' \
  | tee "$EVIDENCE_DIR/A6-ai-tooling.log" || echo "none tracked"
```

- [ ] For each file found, confirm it contains no secrets, no absolute paths, no account identifiers, and no seller-only instructions that would confuse the buyer's team. Record the result here and carry the keep/strip decision into H1.
- [ ] Confirm the product has no runtime dependency on these files: search the build, start, and deploy paths for references.

```sh
git grep -nIiE '(orca|\.omp|\.brief|AGENTS\.md|worktreeinclude)' -- \
  package.json 'scripts/**' '.woodpecker/**' '.githooks/**' 'compose*.y*ml' 'Dockerfile*' \
  2>&1 | tee "$EVIDENCE_DIR/A6-runtime-refs.log" || true
```

Expected: no hits in runtime, build, or deployment files. Hits in documentation are acceptable only if the buyer chooses to keep the tooling (H1).

---

## B. Sample, personal, and production data

### B1. Personal-data patterns in the tree

- [ ] Scan for email addresses, Indonesian mobile numbers, NIK-shaped 16-digit numbers, and NPWP-shaped identifiers.

```sh
git grep -nIE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' -- . \
  ':!package-lock.json' ':!LICENSE' 2>&1 | tee "$EVIDENCE_DIR/B1-personal-data.log" || true
git grep -nIE '\b(\+62|62|0)8[1-9][0-9]{6,11}\b' -- . \
  2>&1 | tee -a "$EVIDENCE_DIR/B1-personal-data.log" || true
git grep -nIE '\b[0-9]{16}\b' -- . \
  2>&1 | tee -a "$EVIDENCE_DIR/B1-personal-data.log" || true
git grep -nIE '\b[0-9]{2}\.[0-9]{3}\.[0-9]{3}\.[0-9]-[0-9]{3}\.[0-9]{3}\b' -- . \
  2>&1 | tee -a "$EVIDENCE_DIR/B1-personal-data.log" || true
```

- [ ] Review every hit. Allowed: `example.com` / `example.org` addresses, documentation placeholders, and synthetic values clearly marked as fake. Not allowed: a real customer, employee, supplier, or vehicle owner.
- [ ] Search seed and fixture code by name, then read the files it lists.

```sh
git grep -lIiE '(seed|fixture|sample|dummy|demo)' -- \
  '*.ts' '*.tsx' '*.js' '*.sql' '*.json' '*.csv' \
  | tee "$EVIDENCE_DIR/B1-seed-files.log" || true
```

- [ ] Confirm seeds create synthetic records only, are safe to run on an empty database, and do not import a production export.
- [ ] Remove any tracked file that contains real personal data. If the file is a useful template, replace the real values with synthetic ones and keep the template.

```sh
# Remove the file from the delivery commit (this does not purge Git history).
git rm '<FILE>'
git commit -m "chore: remove sample personal data from delivery"
```

- [ ] Re-run the B1 scans after the removal and confirm no real record remains in the current tree. If the data must also disappear from history, stop: history rewriting is a destructive Tier 3 action that needs written approval and a coordinated re-clone by everyone who holds a copy.

### B2. Binary assets, documents, and photos

- [ ] List image, document, spreadsheet, and archive files. Review each one; binary content is not covered by the text scans above.

```sh
git ls-files \
  | grep -Ei '\.(png|jpe?g|webp|heic|gif|pdf|docx?|xlsx?|csv|zip)$' \
  | tee "$EVIDENCE_DIR/B2-assets.log" || true
```

- [ ] For each file that could contain personal data (customer documents, vehicle photos, receipts, signatures), confirm it is a synthetic or licensed sample and not a real record.
- [ ] Strip embedded metadata from photos that are kept, unless metadata is part of the licensed asset.

```sh
exiftool -a -G1 -s '<FILE>' | tee "$EVIDENCE_DIR/B2-exif-<FILE>.log"
# Only after confirming the file may ship:
exiftool -all= -overwrite_original '<FILE>'
```

- [ ] Confirm the buyer has the right to receive each asset; carry the license evidence into E4.

### B3. Local uploads, storage, and backups

- [ ] Confirm no runtime data directories are tracked.

```sh
git ls-files \
  | grep -Ei '^(storage|uploads|backups|data|pgdata|redisdata)/' \
  | tee "$EVIDENCE_DIR/B3-runtime-data.log" || echo "none tracked"
```

Expected: none tracked. The schema and migrations belong in Git; uploaded files and database volumes do not.

- [ ] Confirm no database dumps, compressed SQL, or log files are tracked.

```sh
git ls-files \
  | grep -Ei '\.(dump|sql\.gz|log|bak|backup)$' \
  | tee "$EVIDENCE_DIR/B3-dumps.log" || echo "none tracked"
```

- [ ] Review ignored files present in the seller's working directory and decide, file by file, whether any must be deleted rather than shipped. Never copy the working directory; ship the commit (H2).

```sh
git status --porcelain --ignored | head -100 | tee "$EVIDENCE_DIR/B3-ignored-files.log"
```

### B4. Production data boundary

- [ ] Written confirmation from the seller: no production database, upload directory, or backup is part of the delivery. If the buyer wants historical production data, that is a separate migration with its own privacy basis, retention decision, and approval under the decision policy.
- [ ] If any real data must be transferred, record the lawful basis, the fields transferred, the retention period, and the deletion date. This is a Tier 3 decision; see `docs/ops/decision-policy.md`.

---

## C. Fresh-clone build and runtime verification

Run every command in this section on a clean machine or clean OS user, from a fresh clone, using the pinned toolchain. Do not reuse the seller's `node_modules`, Docker volumes, or shell history.

### C1. Clone the exact candidate

- [ ] Clone and check out the commit recorded in 0.4.

```sh
rm -rf "$VERIFY_DIR"
git clone "$REPO_URL" "$VERIFY_DIR" 2>&1 | tee "$EVIDENCE_DIR/C1-clone.log"
cd "$VERIFY_DIR"
git checkout "$COMMIT" 2>&1 | tee -a "$EVIDENCE_DIR/C1-clone.log"
git rev-parse HEAD | tee -a "$EVIDENCE_DIR/C1-clone.log"
git status --porcelain | tee -a "$EVIDENCE_DIR/C1-clone.log"
```

Expected: checked-out hash equals `$COMMIT`; status is empty.

- [ ] Confirm the clone contains no seller-local files: no `.env` with real values, no `.brief/`, no `node_modules`, no `.next/`, no local database volume.

```sh
ls -la | tee "$EVIDENCE_DIR/C1-root-listing.log"
find . -maxdepth 2 -name '.env*' -not -name '*.example' -print \
  | tee -a "$EVIDENCE_DIR/C1-root-listing.log"
```

### C2. Toolchain matches the repository pins

- [ ] Record the installed toolchain and compare it with `.nvmrc`, `package.json` `engines`, the Dockerfile base image, and CI configuration.

```sh
node --version | tee "$EVIDENCE_DIR/C2-toolchain.log"
npm --version | tee -a "$EVIDENCE_DIR/C2-toolchain.log"
docker --version | tee -a "$EVIDENCE_DIR/C2-toolchain.log"
docker compose version | tee -a "$EVIDENCE_DIR/C2-toolchain.log"
cat .nvmrc 2>/dev/null | tee -a "$EVIDENCE_DIR/C2-toolchain.log" || true
node -p 'JSON.stringify(require("./package.json").engines || {})' \
  | tee -a "$EVIDENCE_DIR/C2-toolchain.log"
```

Expected: Node major version identical everywhere. A mismatch is a finding; do not proceed with a different major version.

### C3. Clean dependency install

- [ ] Install exactly from the lockfile.

```sh
npm ci 2>&1 | tee "$EVIDENCE_DIR/C3-npm-ci.log"
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit `0`; the log shows `npm ci`, not `npm install`; no private registry host.

- [ ] Confirm the lockfile is the only dependency source and there are no stray lockfiles.

```sh
git ls-files \
  | grep -E '(^|/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$' \
  | tee "$EVIDENCE_DIR/C3-lockfiles.log"
```

Expected: exactly one root `package-lock.json` for the npm workspace. Any additional lockfile is a finding.

### C4. Container services start from the shipped configuration

- [ ] Render and start the Compose stack exactly as a new developer would.

```sh
docker compose config > "$EVIDENCE_DIR/C4-compose-config.yaml"
docker compose up -d --wait 2>&1 | tee "$EVIDENCE_DIR/C4-compose-up.log"
docker compose ps 2>&1 | tee -a "$EVIDENCE_DIR/C4-compose-up.log"
```

Expected: every service reports healthy or running; `--wait` exits `0`; no bind mount points outside the repository or at an absolute developer path.

- [ ] If the repository ships more than one Compose file, repeat with each documented combination and record which one the README tells a new developer to use.
- [ ] Confirm the ports published to the host are documented and do not collide with common local services by accident.

```sh
docker compose ps --format json | tee "$EVIDENCE_DIR/C4-ports.log"
```

### C5. Migrations and seed

- [ ] Read the available scripts before running them, so the checklist uses the repository's real names.

```sh
npm run 2>&1 | tee "$EVIDENCE_DIR/C5-scripts.log"
```

- [ ] Run migrations from an empty database. Replace the script names if the repository uses different ones.

```sh
npm run db:migrate 2>&1 | tee "$EVIDENCE_DIR/C5-migrate.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Run the same migration command a second time and confirm it is a no-op, not a duplicate or a crash.

```sh
npm run db:migrate 2>&1 | tee "$EVIDENCE_DIR/C5-migrate-second-run.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Run the seed and confirm it produces only synthetic data (see B1).

```sh
npm run db:seed 2>&1 | tee "$EVIDENCE_DIR/C5-seed.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Inspect the resulting schema and row counts.

```sh
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c '\dt' \
  | tee "$EVIDENCE_DIR/C5-tables.log"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;" \
  | tee "$EVIDENCE_DIR/C5-counts.log"
```

- [ ] Confirm rollback or reset is documented. If a migration cannot be rolled back, record that fact and the required backup step before any production use.

### C6. Quality gate with no internal AI tooling

- [ ] Run the repository gate with a stripped environment, so it cannot silently depend on a seller-only agent variable, wrapper, or local tool.

```sh
env -i PATH="$PATH" HOME="$HOME" sh scripts/check.sh 2>&1 \
  | tee "$EVIDENCE_DIR/C6-check-clean-env.log"
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit `0`, with the same checks a developer runs locally. A failure caused by the stripped environment is itself a finding: the gate depends on something that is not documented.

- [ ] Confirm the gate does not invoke AI tooling or a seller-only binary.

```sh
git grep -nIiE '(orca|omp|claude|codex|cursor|windsurf|\.brief)' -- \
  scripts/ .githooks/ .woodpecker/ .github/ 2>&1 \
  | tee "$EVIDENCE_DIR/C6-gate-tooling.log" || true
```

Expected: no hits. If `.githooks/` exists, note that `git config core.hooksPath` is unset by default in a fresh clone; document how a new developer enables the hooks.

- [ ] Run the gate a second time to confirm it is repeatable and does not depend on first-run state.

```sh
sh scripts/check.sh 2>&1 | tee "$EVIDENCE_DIR/C6-check-second-run.log"
echo "exit=${PIPESTATUS[0]}"
```

### C7. Build and smoke test

- [ ] Build the production web app from the fresh clone.

```sh
npm run build 2>&1 | tee "$EVIDENCE_DIR/C7-build.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Start it with the documented command and check the documented health or landing route.

```sh
npm run start > "$EVIDENCE_DIR/C7-start.log" 2>&1 &
START_PID=$!
sleep 10
curl -fsS -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/' \
  | tee "$EVIDENCE_DIR/C7-http.log"
kill "$START_PID"
```

Expected: a `2xx` or documented redirect status. Record the actual status; do not claim a pass on a connection refusal.

- [ ] If an API health endpoint exists, call it and record the response.

```sh
curl -fsS 'http://localhost:3000/api/health' | tee "$EVIDENCE_DIR/C7-health.json"
```

- [ ] For the mobile app, confirm the documented start command launches the bundler. A device or emulator check is optional unless the buyer requires it; record which was done.

```sh
npm run --workspace <MOBILE_WORKSPACE> start 2>&1 | head -40 \
  | tee "$EVIDENCE_DIR/C7-mobile-start.log"
```

### C8. README command verification

- [ ] List every command block in the README and the ops docs.

```sh
grep -n '^```' README.md docs/ops/*.md 2>/dev/null \
  | tee "$EVIDENCE_DIR/C8-command-blocks.log"
```

- [ ] Execute each command, in the documented order, in the fresh clone. Record command, expected result, actual result, and pass/fail in the table below. Remove or fix any command that does not work; do not leave a "known broken" command in a handover README.

| # | Command | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

- [ ] Confirm the README states the Node version, the required services, the database setup, and the seed command without referring to seller-only tooling.
- [ ] Confirm every local URL in the README is `localhost` or `127.0.0.1`, not a seller hostname.

---

## D. Lockfile and build reproducibility

### D1. Lockfile integrity

- [ ] Confirm the lockfile is committed and matches `package.json`. `npm ci` fails when they disagree; record that it succeeds.

```sh
test -f package-lock.json && echo "lockfile present"
git diff --exit-code -- package-lock.json package.json \
  | tee "$EVIDENCE_DIR/D1-lockfile-diff.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Confirm the dependency tree resolves fully.

```sh
npm ls --all > "$EVIDENCE_DIR/D1-npm-ls.log" 2>&1
echo "exit=$?"
```

Expected: exit `0`, no `UNMET DEPENDENCY`, no `invalid` entries.

- [ ] Record the production audit result. Do not describe the result as "clean" unless the command actually reports zero findings.

```sh
npm audit --omit=dev 2>&1 | tee "$EVIDENCE_DIR/D1-npm-audit.log"
echo "exit=${PIPESTATUS[0]}"
```

### D2. Install reproducibility across fresh clones

- [ ] Clone a second time, install with the lockfile, and compare the resolved dependency tree hash.

```sh
export VERIFY_DIR_B=/tmp/handover-verify-b
rm -rf "$VERIFY_DIR_B"
git clone "$REPO_URL" "$VERIFY_DIR_B"
cd "$VERIFY_DIR_B"
git checkout "$COMMIT"
npm ci > "$EVIDENCE_DIR/D2-npm-ci-b.log" 2>&1
npm ls --all --json | shasum -a 256 | tee "$EVIDENCE_DIR/D2-tree-hash-b.log"
```

- [ ] Compare with clone A.

```sh
cd "$VERIFY_DIR"
npm ls --all --json | shasum -a 256 | tee "$EVIDENCE_DIR/D2-tree-hash-a.log"
diff -u "$EVIDENCE_DIR/D2-tree-hash-a.log" "$EVIDENCE_DIR/D2-tree-hash-b.log" \
  | tee "$EVIDENCE_DIR/D2-tree-diff.log"
```

Expected: identical hashes. A difference means a floating dependency or a platform-dependent resolution; identify it before delivery.

### D3. Build reproducibility

- [ ] Build both clones and compare the emitted client assets and file manifest.

```sh
cd "$VERIFY_DIR"
npm run build > "$EVIDENCE_DIR/D3-build-a.log" 2>&1
find .next/static -type f -exec shasum -a 256 {} + 2>/dev/null | sort \
  > "$EVIDENCE_DIR/D3-static-a.sha256"
cd "$VERIFY_DIR_B"
npm run build > "$EVIDENCE_DIR/D3-build-b.log" 2>&1
find .next/static -type f -exec shasum -a 256 {} + 2>/dev/null | sort \
  > "$EVIDENCE_DIR/D3-static-b.sha256"
diff -u "$EVIDENCE_DIR/D3-static-a.sha256" "$EVIDENCE_DIR/D3-static-b.sha256" \
  | tee "$EVIDENCE_DIR/D3-static-diff.log"
```

Expected: no differences for static assets. If hashes differ, record exactly which files differ and explain whether the cause is a timestamp, a generated file, or a real input difference. Do not call it reproducible until the cause is understood.

### D4. Container image pinning

- [ ] Confirm no base image uses a floating tag.

```sh
grep -nE '^[[:space:]]*FROM' Dockerfile* 2>/dev/null \
  | tee "$EVIDENCE_DIR/D4-dockerfiles.log"
```

Expected: every `FROM` has an explicit version, and preferably a digest. `:latest` is a finding.

- [ ] Build the image twice and record the image ID and base digest. Note that bit-identical images are not guaranteed because of timestamps; the dependency tree, base digest, and file manifest must match.

```sh
docker build -t handover-verify:"$COMMIT" . 2>&1 | tee "$EVIDENCE_DIR/D4-build-1.log"
docker image inspect handover-verify:"$COMMIT" \
  --format '{{.Id}} {{.RepoDigests}}' | tee "$EVIDENCE_DIR/D4-image-1.log"
docker build --no-cache -t handover-verify:"$COMMIT"-second . 2>&1 \
  | tee "$EVIDENCE_DIR/D4-build-2.log"
docker image inspect handover-verify:"$COMMIT"-second \
  --format '{{.Id}} {{.RepoDigests}}' | tee "$EVIDENCE_DIR/D4-image-2.log"
```

### D5. One Node version everywhere

- [ ] Confirm `.nvmrc`, `package.json` `engines`, every Dockerfile `FROM node`, and CI agree.

```sh
cat .nvmrc 2>/dev/null
node -p 'JSON.stringify(require("./package.json").engines || {})'
grep -rnE 'node-version|NODE_VERSION|FROM node' Dockerfile* .woodpecker .github 2>/dev/null \
  | tee "$EVIDENCE_DIR/D5-node-version.log" || true
```

Expected: a single major version, currently Node 24 LTS, or whatever the repository pins. Record the actual value.

---

## E. Dependency and asset license audit

### E1. Dependency license inventory

- [ ] Confirm `docs/ops/license-inventory.md` exists, is current for this commit, and lists every production dependency (direct and transitive) with its license.

```sh
test -f docs/ops/license-inventory.md && echo "inventory present"
git log -1 --format='%H %cI' -- docs/ops/license-inventory.md \
  | tee "$EVIDENCE_DIR/E1-inventory.log"
```

- [ ] Produce the production dependency tree and a license summary.

```sh
npm ls --all --omit=dev --json > "$EVIDENCE_DIR/E1-prod-tree.json"
npx --yes license-checker-rseidelsohn@4.3.0 --production --summary \
  2>&1 | tee "$EVIDENCE_DIR/E1-license-summary.log"
```

- [ ] Enforce the approved allowlist. Add a license to this list only after written approval and an inventory update.

```sh
npx --yes license-checker-rseidelsohn@4.3.0 --production \
  --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense;Python-2.0' \
  2>&1 | tee "$EVIDENCE_DIR/E1-license-failures.log"
echo "exit=${PIPESTATUS[0]}"
```

Expected: exit `0`. Any failure is a blocker until the package is replaced, removed from production, or explicitly approved with a record in the inventory and the decision log.

- [ ] Diff the detected package list against the inventory and record every discrepancy.

```sh
npx --yes license-checker-rseidelsohn@4.3.0 --production --json \
  > "$EVIDENCE_DIR/E1-detected.json"
```

### E2. Asset license audit

- [ ] Inventory every non-code asset: fonts, icons, illustrations, images, sample CSV, audio, map tiles, QRIS or payment logos, and any copied text.

| Asset | Path | Source | License | Commercial use | Redistribution | Attribution required | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

- [ ] Confirm every row appears in `docs/ops/license-inventory.md`, or add it before delivery.
- [ ] For fonts and icons, check that the license permits embedding and redistribution in a commercial product.
- [ ] For screenshots or images of third-party products, confirm they are licensed or replace them. Do not rely on "it was on the internet".
- [ ] For sample data, confirm it was generated for this project and carries no third-party rights.

### E3. Notices and attributions

- [ ] Generate the attribution text required by the licenses that demand it.

```sh
npx --yes license-checker-rseidelsohn@4.3.0 --production --plainVertical \
  > "$EVIDENCE_DIR/E3-attributions.txt"
```

- [ ] If any license requires a notice file, confirm it is shipped at the repository root or in the documented location, and that the build or installer includes it.

```sh
ls -la THIRD-PARTY-NOTICES* NOTICE* 2>/dev/null \
  | tee "$EVIDENCE_DIR/E3-notice-files.log" || echo "no notice file"
```

- [ ] Confirm the delivered code's own license is correct and intentional (for example, the buyer receives the rights stated in the sale contract), and that `LICENSE` names the correct copyright holder.

```sh
head -20 LICENSE
git grep -nIiE 'SPDX-License-Identifier' -- . | sort | uniq -c \
  | tee "$EVIDENCE_DIR/E3-spdx.log" || true
```

### E4. Transfer evidence for third-party assets

- [ ] For every paid, restricted, or non-transferable asset (stock photo, font, icon set, template, plugin, dataset), obtain written transfer permission or a license issued or assigned to the buyer.
- [ ] Store the evidence outside the repository if it contains personal data or contract terms. Record the location, date, counterparty, and SHA-256 of the evidence file.

```sh
shasum -a 256 '<EVIDENCE_FILE>' | tee "$EVIDENCE_DIR/E4-transfer-<ASSET>.sha256"
```

- [ ] If an asset cannot be transferred, remove it from the delivery and record the replacement. Do not ship it "for now".

### E5. Seller copy deletion where required

- [ ] Read each asset license and mark whether it requires the seller to delete their copies after transfer.
- [ ] For each asset that requires deletion, remove the seller's copies from: local clones, forks and mirrors, CI caches, container registries, generated installers, design-tool files, screenshots, and backups.
- [ ] **Destructive step — obtain written approval before running.** Record each location, the deletion command or console action, the date, and the person who confirmed it.

```sh
# Example only; confirm the exact image and tag first.
docker image ls | grep 'handover-verify'
docker image rm 'handover-verify:<TAG>'
```

- [ ] Confirm the buyer's copy still works after the seller's copies are deleted. If it does not, the transfer was not complete.
- [ ] Where a license does not require deletion, record that decision instead of deleting.

### E6. Copyleft and network-copyleft review

- [ ] Confirm no GPL, AGPL, LGPL, SSPL, or other reciprocal license appears in the production tree without written approval.
- [ ] Pay special attention to server-side packages: AGPL and SSPL obligations can be triggered by offering the software over a network, even when the code is not distributed.
- [ ] Record any approved exception with the package name, version, license, approver, and review date. An exception without an expiry date is not acceptable for a security-sensitive dependency.

---

## F. Operations: backup, restore, and runtime ownership

### F1. Backup restore drill

Perform this on a disposable database. Do not restore over the only copy of any data.

- [ ] Create a backup with the documented production command, or the closest local equivalent.

```sh
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f /tmp/handover.dump \
  2>&1 | tee "$EVIDENCE_DIR/F1-dump.log"
docker compose cp db:/tmp/handover.dump "$EVIDENCE_DIR/handover.dump" \
  2>&1 | tee -a "$EVIDENCE_DIR/F1-dump.log"
shasum -a 256 "$EVIDENCE_DIR/handover.dump" \
  | tee "$EVIDENCE_DIR/F1-dump.sha256"
```

- [ ] Restore into a new database and time the operation.

```sh
docker compose exec -T db createdb -U "$DB_USER" handover_restore
time docker compose exec -T db pg_restore -U "$DB_USER" -d handover_restore \
  --clean --if-exists < "$EVIDENCE_DIR/handover.dump" \
  2>&1 | tee "$EVIDENCE_DIR/F1-restore.log"
```

- [ ] Compare row counts for the core tables between source and restore. Record the actual numbers.

```sh
for t in products sales sale_items customers vehicles users; do
  docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT '$t', count(*) FROM $t;" 2>/dev/null
  docker compose exec -T db psql -U "$DB_USER" -d handover_restore -tAc \
    "SELECT '$t', count(*) FROM $t;" 2>/dev/null
done | tee "$EVIDENCE_DIR/F1-row-counts.log"
```

Adjust the table list to the real schema. Every count must match, or the difference must be explained (for example, sequences or audit tables excluded by design).

- [ ] Record the measured restore time (RTO) and the backup cadence (RPO) that the runbook promises. If no production backup exists yet, say so explicitly and do not claim an RPO.
- [ ] Remove the disposable database.

```sh
docker compose exec -T db dropdb -U "$DB_USER" handover_restore
```

### F2. Runtime ownership and health signals

- [ ] Confirm the documented health endpoint and the expected healthy response.

```sh
curl -fsS 'http://localhost:3000/api/health' | tee "$EVIDENCE_DIR/F2-health.json"
```

- [ ] Confirm the buyer knows who receives alerts after handover: name or role, channel, and escalation path. Record the alert route, not just the monitoring tool name.
- [ ] Trigger one test alert end to end and capture the notification. A monitoring tool that has never delivered an alert is unverified.
- [ ] Confirm logs do not contain personal data or secrets. Search a sample of application logs for email addresses and tokens.

```sh
docker compose logs --no-color --tail 200 \
  | grep -nIE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
  | tee "$EVIDENCE_DIR/F2-log-pii.log" || echo "no email-shaped data in sampled logs"
```

### F3. Data residency and retention

- [ ] Record the hosting region for the database, object storage, and backups. If Indonesian personal data is stored, confirm the region and any cross-border transfer with the buyer's counsel before go-live.
- [ ] Record the retention period for sales records, customer and vehicle records, application logs, and backups. Confirm the deletion procedure is documented and has been exercised on a disposable environment.
- [ ] Confirm the privacy notice matches what the software actually collects. This is a Tier 3 legal decision; the seller does not decide it unilaterally.

### F4. Deployment and rollback runbook accuracy

- [ ] On a staging environment that the buyer controls, execute the documented deploy command and the documented rollback command.
- [ ] Record the exact commands, the observed health checks, the time to recover, and any manual step that is not in the runbook.
- [ ] Confirm the runbook names the database backup step that must precede a migration, and the exact condition that triggers a rollback.
- [ ] The seller must not deploy to the buyer's production environment. Delivery ends with a verified runbook, not a seller-operated go-live.

---

## G. Credentials, domains, and account ownership

### G1. Account inventory and transfer

- [ ] Complete one row per external account. "Owner after handover" must be a buyer-controlled identity, not the seller's personal account.

| Account / service | Purpose | Current owner | Transfer method | 2FA reset | Recovery email/phone | Owner after handover | Verified by buyer | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Domain registrar | Domain ownership |  |  |  |  |  |  |  |
| DNS provider | DNS records |  |  |  |  |  |  |  |
| Source hosting | Repository access |  |  |  |  |  |  |  |
| CI/CD | Build and deploy |  |  |  |  |  |  |  |
| Container registry | Image storage |  |  |  |  |  |  |  |
| Application hosting | Runtime |  |  |  |  |  |  |  |
| Database | Data storage |  |  |  |  |  |  |  |
| Object storage | Uploads, backups |  |  |  |  |  |  |  |
| Payment gateway | Card/QRIS payments |  |  |  |  |  |  |  |
| QRIS / acquiring provider | QRIS payments |  |  |  |  |  |  |  |
| Email / SMTP | Transactional email |  |  |  |  |  |  |  |
| WhatsApp Business API | Notifications |  |  |  |  |  |  |  |
| Error tracking | Monitoring |  |  |  |  |  |  |  |
| Uptime monitoring | Availability alerts |  |  |  |  |  |  |  |
| Analytics | Product analytics |  |  |  |  |  |  |  |
| App Store Connect | iOS distribution |  |  |  |  |  |  |  |
| Google Play Console | Android distribution |  |  |  |  |  |  |  |
| Backup destination | Backup storage |  |  |  |  |  |  |  |

- [ ] For each row, the buyer signs in successfully with the transferred credentials and the seller confirms their own access is reduced or removed.
- [ ] Do not record passwords, tokens, recovery codes, or private keys in this table. Record the secret manager path only.

### G2. Domain and TLS verification

- [ ] Confirm DNS resolves to the intended target and the registrar is unlocked for transfer, or the domain is already in the buyer's account.

```sh
dig +short "$DOMAIN" A | tee "$EVIDENCE_DIR/G2-dns-a.log"
dig +short "$DOMAIN" NS | tee "$EVIDENCE_DIR/G2-dns-ns.log"
whois "$DOMAIN" 2>/dev/null | grep -iE 'registrar|expiry|status' \
  | tee "$EVIDENCE_DIR/G2-whois.log" || true
```

- [ ] Confirm the TLS certificate is valid, covers the expected names, and has enough remaining lifetime for the buyer to take over renewal.

```sh
echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates \
  | tee "$EVIDENCE_DIR/G2-tls.log"
```

- [ ] Confirm the certificate renewal method (automatic ACME, provider-managed, or manual) and who owns it after handover.
- [ ] Confirm email authentication records (SPF, DKIM, DMARC) are documented if the product sends email.

### G3. Post-handover access review

- [ ] After the buyer confirms access, revoke the seller's remaining access: repository, CI, hosting, database, payment dashboard, app stores, DNS, monitoring, and secret manager.
- [ ] Record the revocation date and the person who confirmed it.
- [ ] Verify the seller can no longer sign in, and the buyer still can.
- [ ] Transfer or close any seller-owned billing account. Any change that creates recurring spend is a Tier 3 decision; see `docs/ops/decision-policy.md`.

---

## H. Final package, AI-tooling decision, and sign-off

### H1. Buyer decision: keep or strip AI-ready development tooling

Some repositories contain files that support AI-assisted development but are not needed to build or run the product: `AGENTS.md`, `.omp/`, `orca.yaml`, and `.worktreeinclude`. Choose one option, record the decision, and make the delivery commit match it.

**Option A — keep as optional AI-ready documentation**

- [ ] Confirm A1, A5, and A6 pass for every kept file.
- [ ] Add a short README note stating that these files are optional developer tooling, are not runtime dependencies, and may be deleted without affecting the product.
- [ ] Confirm `.brief/` is **not** tracked and is not part of the delivery.
- [ ] Confirm no kept file contains a secret, an absolute path, an internal hostname, or a seller account identifier.

**Option B — strip from the final handover commit**

- [ ] Obtain written approval; this removes files from the delivery commit.
- [ ] Remove only the agreed paths. Keep the product's own CI, hooks, and docs.

```sh
git rm -r --cached --ignore-unmatch .omp AGENTS.md orca.yaml .worktreeinclude
rm -rf .omp AGENTS.md orca.yaml .worktreeinclude
rm -rf .brief
git status --short | tee "$EVIDENCE_DIR/H1-strip-status.log"
git commit -m "chore: remove optional AI development tooling from handover" \
  2>&1 | tee "$EVIDENCE_DIR/H1-strip-commit.log"
```

- [ ] Verify none of the stripped paths remains tracked.

```sh
git ls-files \
  | grep -E '(^|/)(AGENTS\.md|\.omp/|\.brief/|orca\.yaml|\.worktreeinclude)$' \
  | tee "$EVIDENCE_DIR/H1-strip-verify.log" || echo "clean"
```

- [ ] If `orca.yaml` or `.worktreeinclude` is stripped, confirm no documentation still instructs the buyer to use it.

Record:

| Field | Value |
| --- | --- |
| Option chosen (A or B) |  |
| Decided by (buyer representative) |  |
| Date |  |
| Rationale |  |
| Delivery commit after the decision |  |

### H2. Delivery manifest

Run this only after the delivery commit is final and H1 is complete.

- [ ] Record the commit and produce a file manifest and a source archive.

```sh
git status --porcelain | tee "$EVIDENCE_DIR/H2-status.log"
git rev-parse HEAD | tee "$EVIDENCE_DIR/H2-commit.log"
git ls-files | wc -l | tee "$EVIDENCE_DIR/H2-file-count.log"
git ls-files -z | sort -z | xargs -0 shasum -a 256 \
  > "$EVIDENCE_DIR/H2-manifest.sha256"
git archive --format=tar.gz --prefix="handover-$(git rev-parse --short HEAD)/" \
  HEAD -o "$EVIDENCE_DIR/handover-$(git rev-parse --short HEAD).tar.gz"
shasum -a 256 "$EVIDENCE_DIR"/handover-*.tar.gz \
  | tee "$EVIDENCE_DIR/H2-archive.sha256"
```

Expected: status is empty; the archive contains only tracked files from the recorded commit; the manifest and archive hashes are recorded in the sign-off table.

- [ ] Extract the archive into a clean directory and verify it matches the manifest.

```sh
mkdir -p /tmp/handover-archive-check
tar -xzf "$EVIDENCE_DIR"/handover-*.tar.gz -C /tmp/handover-archive-check
cd /tmp/handover-archive-check/handover-*
find . -type f -print0 | sort -z | xargs -0 shasum -a 256 \
  > "$EVIDENCE_DIR/H2-archive-manifest.sha256"
```

- [ ] Confirm the archive file list matches the tracked file list exactly.

```sh
cd "$VERIFY_DIR"
git ls-files | sort > "$EVIDENCE_DIR/H2-manifest-files.txt"
(cd /tmp/handover-archive-check/handover-* && find . -type f | sed 's|^\./||' | sort) \
  > "$EVIDENCE_DIR/H2-archive-files.txt"
diff -u "$EVIDENCE_DIR/H2-manifest-files.txt" "$EVIDENCE_DIR/H2-archive-files.txt" \
  | tee "$EVIDENCE_DIR/H2-file-list-diff.log"
echo "exit=${PIPESTATUS[0]}"
```

- [ ] Confirm the archive contains no `.env` with real values, no `.brief/`, no `node_modules/`, no database dumps, and no seller-only credentials.

```sh
tar -tzf "$EVIDENCE_DIR"/handover-*.tar.gz \
  | grep -E '(^|/)(\.env$|\.brief/|node_modules/|\.next/|.*\.(dump|sql\.gz|log)$)' \
  | tee "$EVIDENCE_DIR/H2-archive-unwanted.log" || echo "archive clean"
```

- [ ] Record the delivery channel (buyer-owned repository, signed archive, or both) and who has access.

### H3. Tag and release record

- [ ] Create an annotated tag on the delivery commit.

```sh
git tag -a "handover-<DATE>" -m "Handover <DATE> $(git rev-parse HEAD)"
git show --no-patch "handover-<DATE>" | tee "$EVIDENCE_DIR/H3-tag.log"
```

- [ ] Push the tag only if the seller's repository is the agreed delivery channel and the seller's owner has approved the push. Pushing is a remote change, not a local cleanup.

```sh
# Requires written approval before running.
git push origin "handover-<DATE>"
```

- [ ] Record the tag name, commit, archive hash, and date in the sign-off table.

### H4. Final sign-off manifest

Complete every field. An empty field means the handover is incomplete.

| Item | Result | Evidence path | Verified by | Date |
| --- | --- | --- | --- | --- |
| A1 full-history secret scan |  |  |  |  |
| A2 tracked secret-shaped files |  |  |  |  |
| A3 credential rotation |  |  |  |  |
| A4 environment-file discipline |  |  |  |  |
| A5 local paths and internal names |  |  |  |  |
| A6 AI tooling inventory |  |  |  |  |
| B1 personal-data patterns |  |  |  |  |
| B2 binary assets |  |  |  |  |
| B3 runtime data and dumps |  |  |  |  |
| B4 production data boundary |  |  |  |  |
| C1 fresh clone |  |  |  |  |
| C2 toolchain pins |  |  |  |  |
| C3 `npm ci` |  |  |  |  |
| C4 Compose services |  |  |  |  |
| C5 migrations and seed |  |  |  |  |
| C6 `scripts/check.sh` in a clean environment |  |  |  |  |
| C7 build and smoke test |  |  |  |  |
| C8 README commands |  |  |  |  |
| D1 lockfile integrity |  |  |  |  |
| D2 install reproducibility |  |  |  |  |
| D3 build reproducibility |  |  |  |  |
| D4 container image pinning |  |  |  |  |
| D5 Node version consistency |  |  |  |  |
| E1 dependency licenses |  |  |  |  |
| E2 asset licenses |  |  |  |  |
| E3 notices and attributions |  |  |  |  |
| E4 transfer evidence |  |  |  |  |
| E5 seller copy deletion |  |  |  |  |
| E6 copyleft review |  |  |  |  |
| F1 backup restore drill |  |  |  |  |
| F2 alerts and log hygiene |  |  |  |  |
| F3 residency and retention |  |  |  |  |
| F4 deploy and rollback runbook |  |  |  |  |
| G1 account transfer |  |  |  |  |
| G2 domain and TLS |  |  |  |  |
| G3 seller access revoked |  |  |  |  |
| H1 AI tooling decision |  |  |  |  |
| H2 archive and manifest |  |  |  |  |
| H3 tag and release record |  |  |  |  |

Delivery facts:

| Field | Value |
| --- | --- |
| Delivery commit (full SHA) |  |
| Delivery tag |  |
| Source archive SHA-256 |  |
| File manifest SHA-256 |  |
| `package-lock.json` SHA-256 |  |
| Production dependency count |  |
| Open defects accepted by the buyer |  |
| Known risks accepted by the buyer |  |
| Evidence location |  |
| Handover date |  |

Approvals:

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Seller engineering lead |  |  |  |
| Seller owner (commercial and legal) |  |  |  |
| Buyer technical representative |  |  |  |
| Buyer product owner |  |  |  |
| Buyer counsel (if Tier 3 items were decided) |  |  |  |

**Explicit non-claims**

- This checklist does not certify that the product is free of security defects; it records the checks that were run.
- It does not certify legal compliance, tax correctness, or fitness for the buyer's business. Those are the buyer's counsel's decisions.
- It does not include a penetration test, a load test, or a full accessibility audit unless one is separately commissioned and its report is attached.
- No item in this document is complete until the evidence exists and a second person has reviewed it.
