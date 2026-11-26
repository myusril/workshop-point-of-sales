#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f packages/db/package.json ]; then
  exec npm run db:migrate --workspace packages/db
fi

echo "db:migrate: packages/db does not exist yet; migrations land in WP2. Nothing to apply."
exit 0
