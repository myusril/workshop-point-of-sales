#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f packages/db/package.json ]; then
  exec npm run db:seed --workspace packages/db
fi

echo "db:seed: packages/db does not exist yet; seed data lands in WP2. Nothing to load."
exit 0
