# CI Notes

The pipeline in `ci.yml` is provider-neutral Woodpecker configuration. It runs:

1. `gitleaks dir .` — a secret finding fails the pipeline.
2. `npm ci`.
3. `bash scripts/check.sh` with `WP_CI=1` — license report, typecheck, lint,
   unit, integration, E2E, and build, in that order.

`scripts/check.sh` in CI mode uses the provided PostgreSQL service
(`DATABASE_URL`, `INTEGRATION_DATABASE_URL`) and never starts Docker. The local
default is unchanged: Docker Compose on `127.0.0.1:55432`.

## Repository secrets

Configure these in the CI provider; never commit a value.

| Secret | Purpose |
|---|---|
| `postgres_password` | Password for the ephemeral PostgreSQL service |
| `ci_database_url` | Full connection URL to the ephemeral `workshop_pos` database |
| `ci_integration_database_url` | Full connection URL to an ephemeral database whose name ends in `_test` |
| `better_auth_secret` | Test-only Better Auth secret, at least 32 characters |

## Local preflight

```sh
bash scripts/install-hooks.sh
```

This sets `core.hooksPath` to `.githooks` for the current clone. `pre-commit`
runs the staged secret/whitespace guard and the workspace typecheck; `pre-push`
runs the full aggregate gate. Do not use `--no-verify`.
